import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';

const FlyContext = createContext(null);

export function useFly() {
  return useContext(FlyContext);
}

const FLY_SIZE = 36;
const DURATION = 0.72; // 0.6–0.9s 之间，符合要求

/* 单个飞行元素：水平匀速 + 垂直抛物线（先上抛再落下）+ 旋转缩放收尾 */
function FlyingItem({ fly }) {
  const dx = fly.end.x - fly.start.x;
  const dy = fly.end.y - fly.start.y;
  // 抛物线顶点：距离越远抛得越高，但不超过 110px，保持轻盈
  const peak = -Math.min(110, Math.abs(dy) * 0.35 + 26);

  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{
        left: fly.start.x - FLY_SIZE / 2,
        top: fly.start.y - FLY_SIZE / 2,
        width: FLY_SIZE,
        height: FLY_SIZE,
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.16 }}
    >
      {/* 外层：水平位移（匀速）。每一层都铺满 36×36，保证内层可见 */}
      <motion.div
        className="h-full w-full"
        initial={{ x: 0 }}
        animate={{ x: dx }}
        transition={{ duration: DURATION, ease: 'linear' }}
      >
        {/* 中层：垂直位移（先缓升后加速下落，模拟重力） */}
        <motion.div
          className="h-full w-full"
          initial={{ y: 0 }}
          animate={{ y: [0, peak, dy] }}
          transition={{ duration: DURATION, times: [0, 0.45, 1], ease: ['easeInOut', 'easeIn'] }}
        >
          {/* 内层：飞行中旋转 + 缩小 */}
          <motion.div
            className="h-full w-full overflow-hidden rounded-full shadow-soft"
            style={
              fly.image
                ? {
                    backgroundImage: `url("${fly.image}")`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
            initial={{ rotate: 0, scale: 1 }}
            animate={{ rotate: 220, scale: 0.2 }}
            transition={{ duration: DURATION, ease: 'easeInOut' }}
          >
            {!fly.image && <div className="h-full w-full bg-gradient-to-br from-coral to-rose" />}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* 全局飞入购物车动画系统：
 * - fly(fromEl, { image })：从某个按钮元素位置飞向购物车图标
 * - registerTarget(el)：由底部购物车栏注册图标位置
 * - 支持快速连续点击，多个飞行元素可叠加互不干扰
 */
export function FlyProvider({ children }) {
  const [flies, setFlies] = useState([]);
  const targetRef = useRef(null);
  const seqRef = useRef(0);
  // 记录每个 id 是否已完成，保证 removeFly 只生效一次（防 StrictMode 重复触发）
  const doneRef = useRef(new Set());

  const registerTarget = useCallback((el) => {
    targetRef.current = el;
  }, []);

  const removeFly = useCallback((id) => {
    if (doneRef.current.has(id)) return; // 已完成过，忽略（幂等）
    doneRef.current.add(id);
    setFlies((list) => list.filter((f) => f.id !== id));
    // 通知购物车栏：有菜品「降落」，触发图标弹跳反馈
    window.dispatchEvent(new CustomEvent('co:fly-done'));
  }, []);

  const fly = useCallback((fromEl, { image } = {}) => {
    const target = targetRef.current;
    if (!fromEl || !target) return;
    const from = fromEl.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const id = ++seqRef.current;
    const item = {
      id,
      start: { x: from.left + from.width / 2, y: from.top + from.height / 2 },
      end: { x: to.left + to.width / 2, y: to.top + to.height / 2 },
      image,
    };
    setFlies((list) => [...list, item]);

    // 定时器权威清理：动画完整跑完一遍（DURATION）后再降落到购物车并移除。
    // 相比 onAnimationComplete，定时器时序可靠，不会提前截断或重复触发。
    setTimeout(() => removeFly(id), DURATION * 1000 + 80);
  }, [removeFly]);

  const value = { fly, registerTarget };

  return (
    <FlyContext.Provider value={value}>
      {children}
      {/* 飞行元素层：覆盖全屏、不拦截点击 */}
      <div className="pointer-events-none fixed inset-0 z-[70]">
        {flies.map((f) => (
          <FlyingItem key={f.id} fly={f} />
        ))}
      </div>
    </FlyContext.Provider>
  );
}