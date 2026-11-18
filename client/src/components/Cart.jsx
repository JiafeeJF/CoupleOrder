import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { useCart } from '../CartContext.jsx';
import { useFly } from '../FlyContext.jsx';
import { useConfirm } from '../ConfirmContext.jsx';
import { IconCart, IconMinus, IconPlus } from './Icons.jsx';

/* 数量加减器（菜品卡片 / 购物车明细共用） */
export function Stepper({ qty, onAdd, onDec, size = 'md' }) {
  const btnCls = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
  const addBtnRef = useRef(null);

  return (
    <div className="flex items-center gap-2">
      <motion.button
        onClick={onDec}
        whileTap={{ scale: 0.82 }}
        className={`flex ${btnCls} items-center justify-center rounded-full border border-latte/40 bg-white text-latte shadow-sm`}
      >
        <IconMinus className="h-3.5 w-3.5" />
      </motion.button>

      {/* 数字：数量变化时 spring 弹跳 */}
      <motion.span
        key={qty}
        initial={{ scale: 0.4 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        className="w-5 text-center text-sm font-bold text-cocoa"
      >
        {qty}
      </motion.span>

      <motion.button
        ref={addBtnRef}
        onClick={() => onAdd(addBtnRef.current)}
        whileTap={{ scale: 0.82 }}
        className={`flex ${btnCls} items-center justify-center rounded-full bg-gradient-to-br from-coral to-rose text-white shadow-sm`}
      >
        <IconPlus className="h-3.5 w-3.5" />
      </motion.button>
    </div>
  );
}

/* 商品图片缩略图（无图显示占位） */
export function ItemThumb({ image, name, size = 'md' }) {
  const cls = size === 'sm' ? 'h-10 w-10 rounded-lg' : 'h-14 w-14 rounded-xl';
  return (
    <div className={`relative ${cls} shrink-0 overflow-hidden bg-blush`}>
      {image ? (
        <img src={image} alt={name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-latte/30">
          <svg className="h-1/2 w-1/2" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 3H3v18h18V3zm-4 5l-5 7-4-4-3 4V5h16v8l-4-5z" />
          </svg>
        </div>
      )}
    </div>
  );
}

const NAV_H = 'calc(4rem + env(safe-area-inset-bottom))';

/* 底部购物车栏 + 展开面板 */
export default function CartBar() {
  const { cart, count, total, open, closeCart, toggleCart, clearCart, addToCart, decrease } = useCart();
  const { fly, registerTarget } = useFly();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const iconControls = useAnimationControls();
  const cartIconRef = useRef(null);

  // 购物车面板内点「+」：从该按钮飞向购物车图标（菜品无图，用色块代替）
  const flyFromSheet = (el) => {
    fly(el, {});
  };

  // 把购物车图标位置注册为「飞入动画」的目标点
  useEffect(() => {
    registerTarget(cartIconRef.current);
  }, [registerTarget]);

  // 菜品飞入落地后，购物车图标弹跳反馈
  useEffect(() => {
    const onFlyDone = () => {
      iconControls.start({
        scale: [1, 1.35, 1],
        transition: { duration: 0.4, ease: 'easeOut' },
      });
    };
    window.addEventListener('co:fly-done', onFlyDone);
    return () => window.removeEventListener('co:fly-done', onFlyDone);
  }, [iconControls]);

  const onBarClick = () => {
    if (!count) return;
    toggleCart();
  };

  const handleClearCart = async () => {
    const ok = await confirm({
      title: '清空购物车',
      message: `确定要清空已选的 ${count} 件菜品吗？`,
      confirmText: '清空',
      danger: true,
    });
    if (ok) clearCart();
  };

  const goCheckout = () => {
    if (!count) return;
    closeCart();
    navigate('/checkout');
  };

  return (
    <>
      {/* 遮罩 */}
      {open && (
        <div className="animate-fade-in fixed inset-0 z-40 bg-black/30" onClick={closeCart} />
      )}

      <div className="fixed inset-x-0 z-50 mx-auto max-w-md" style={{ bottom: NAV_H }}>
        {/* 展开的已选菜品面板 */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-x-3 bottom-full z-0 overflow-hidden"
            >
              <motion.div
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: '100%' }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex max-h-[52vh] flex-col overflow-hidden rounded-2xl bg-white shadow-soft"
              >
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-peach" />
              <div className="flex shrink-0 items-center justify-between border-b border-peach px-4 py-3">
                <p className="text-sm font-bold text-cocoa">
                  已选商品
                  {count > 0 && <span className="ml-1 text-xs font-normal text-latte">（{count} 件）</span>}
                </p>
                <div className="flex items-center gap-3">
                  {cart.length > 0 && (
                    <button onClick={handleClearCart} className="text-xs text-latte underline-offset-2 hover:underline">
                      清空
                    </button>
                  )}
                  <button onClick={closeCart} className="flex h-7 w-7 items-center justify-center rounded-full bg-blush text-cocoa">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
                {cart.length === 0 ? (
                  <p className="py-10 text-center text-sm text-latte">购物车还是空的，去菜单选点好吃的吧</p>
                ) : (
                  <ul className="divide-y divide-peach/70">
                    {cart.map((it) => (
                      <motion.li
                        key={it.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className="flex items-center gap-3 py-3"
                      >
                        <ItemThumb image={it.image} name={it.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-cocoa">{it.name}</p>
                          <p className="mt-0.5 text-xs text-latte">¥{it.price.toFixed(2)}</p>
                        </div>
                        <Stepper
                          qty={it.quantity}
                          size="sm"
                          onAdd={(el) => {
                            addToCart(it);
                            flyFromSheet(el);
                          }}
                          onDec={() => decrease(it.id)}
                        />
                      </motion.li>
                    ))}
                  </ul>
                )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 底部购物车栏 */}
        <motion.div
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          className="relative z-10 mx-3 flex items-center justify-between rounded-2xl bg-gradient-to-r from-tangerine to-rose px-4 py-3 shadow-soft ring-1 ring-white/20"
        >
          <motion.button
            onClick={onBarClick}
            whileTap={{ scale: 0.96 }}
            className="flex flex-1 items-center gap-3 text-left"
            disabled={!count}
          >
            {/* 飞入动画目标点 */}
            <span ref={cartIconRef} className="relative">
              <motion.span animate={iconControls} className="block">
                <IconCart className={`h-7 w-7 transition-colors ${count ? 'text-white' : 'text-white/40'}`} />
              </motion.span>
              {count > 0 && (
                <motion.span
                  key={count}
                  initial={{ scale: 0.3 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                  className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose px-1 text-[10px] font-bold text-white"
                >
                  {count > 99 ? '99+' : count}
                </motion.span>
              )}
            </span>
            <div>
              {count > 0 ? (
                <>
                  <p className="text-base font-extrabold leading-tight text-white">¥{total.toFixed(2)}</p>
                  <p className="text-[11px] text-white/60">共 {count} 件</p>
                </>
              ) : (
                <p className="text-sm text-white/50">购物车是空的</p>
              )}
            </div>
          </motion.button>

          <motion.button
            onClick={goCheckout}
            whileTap={{ scale: 0.94 }}
            disabled={!count}
            className={`rounded-xl px-6 py-2.5 text-sm font-bold transition-colors ${
              count
                ? 'bg-gradient-to-r from-coral to-rose text-white shadow-sm'
                : 'bg-white/10 text-white/40'
            }`}
          >
            去结算
          </motion.button>
        </motion.div>
      </div>
    </>
  );
}