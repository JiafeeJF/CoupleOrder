import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useAnimationControls } from 'framer-motion';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useCart } from '../CartContext.jsx';
import { useFly } from '../FlyContext.jsx';
import { useConfirm } from '../ConfirmContext.jsx';
import { useToast } from '../ToastContext.jsx';
import { getSocket, requestMenu } from '../socket.js';
import { IconPlus, IconEdit, IconDelete, IconSearch, IconHeart, IconCheck, IconStar, IconBell } from '../components/Icons.jsx';
import { Stepper, default as CartBar } from '../components/Cart.jsx';
import Avatar from '../components/Avatar.jsx';
import { Spinner } from '../components/Spinner.jsx';
import MenuItemForm, { CATEGORY_ORDER } from '../components/MenuItemForm.jsx';
import { preloadMenuImages, purgeItemImageFromCache } from '../utils/image.js';
import { pushSystemNotification } from '../utils/notify.js';

/* 分类排序：优先按外卖平台的常见顺序展示 */
function sortCategories(categories) {
  const idx = (c) => {
    const i = CATEGORY_ORDER.indexOf(c);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return [...new Set(categories)].sort((a, b) => idx(a) - idx(b));
}

// 相对时间：刚刚 / x 分钟前 / x 小时前 / 昨天 / x 天前
function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return '刚刚';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

/* 菜品卡片 */
function DishCard({ item, qty, displayImage }) {
  const { addToCart, decrease } = useCart();
  const { fly } = useFly();
  const addControls = useAnimationControls();

  // 加入购物车：触发飞入动画 + 按钮亮起/轻震反馈
  const handleAdd = (e) => {
    addToCart(item);
    fly(e.currentTarget, { image: item.image });
    addControls.start({
      scale: [1, 1.18, 1],
      filter: ['brightness(1)', 'brightness(1.4)', 'brightness(1)'],
      x: [0, -4, 4, -3, 3, 0],
      transition: { duration: 0.45 },
    });
  };

  return (
    <div className={`flex gap-3 py-3 transition-opacity ${!item.available ? 'opacity-55' : ''}`}>
      {/* 图片 */}
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-blush">
        {displayImage ? (
          <img src={displayImage} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-latte/30">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 3H3v18h18V3zm-4 5l-5 7-4-4-3 4V5h16v8l-4-5z" />
            </svg>
          </div>
        )}
        {!item.available && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <span className="rounded-full bg-latte px-2.5 py-0.5 text-[10px] font-medium text-white">已下架</span>
          </div>
        )}
      </div>

      {/* 信息 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm font-semibold text-cocoa">{item.name}</p>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-latte">
          {item.description || 'TA 还没来得及写描述～'}
        </p>
        <div className="mt-auto flex items-center justify-between pt-1.5">
          <p className="text-base font-extrabold text-rose">
            <span className="mr-0.5 text-xs font-medium">¥</span>
            {item.price.toFixed(2)}
          </p>
          {item.available ? (
            qty > 0 ? (
              <Stepper
                qty={qty}
                onAdd={(el) => {
                  addToCart(item);
                  fly(el, { image: item.image });
                }}
                onDec={() => decrease(item.id)}
              />
            ) : (
              <motion.button
                onClick={handleAdd}
                animate={addControls}
                whileTap={{ scale: 0.82 }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-tangerine text-white shadow-sm"
              >
                <IconPlus className="h-4 w-4" />
              </motion.button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* 空状态 */
function EmptyState({ onGoManage }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <IconHeart className="h-12 w-12 text-rose" />
      <p className="mt-3 text-sm font-medium text-cocoa">菜单还是空的</p>
      <p className="mt-1 text-xs text-latte">去添加几道家常菜，开始你们的点餐之旅吧</p>
      <button onClick={onGoManage} className="btn-primary mt-4 px-6 text-xs">
        添加菜品
      </button>
    </div>
  );
}

export default function Menu() {
  const { user, partner, socketReady } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const { cart, setCart } = useCart();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [manageMode, setManageMode] = useState(!!location.state?.manage);
  const [partnerOnline, setPartnerOnline] = useState(true);
  // 顶部「我们的菜单」统计：完成单数 + 对方平均评分 + 最近一次点餐
  const [stats, setStats] = useState({ doneOrders: 0, avgRating: null, lastOrderAt: null });
  // 从底部导航长按呼出管理弹窗进入时，Menu 已挂载，需监听 state 变化进入管理模式
  useEffect(() => {
    if (location.state?.manage) setManageMode(true);
  }, [location.state]);
  const [editItem, setEditItem] = useState(null);
  const [showForm, setShowForm] = useState(false);
  // source image url → 本地缓存命中的展示 url（预加载后填充）
  const [imageMap, setImageMap] = useState(new Map());
  const [categoryHistory, setCategoryHistory] = useState([]);
  const categoryStorageKey = `co_category_shortcuts_${[user?.id, partner?.id].filter(Boolean).sort((a, b) => a - b).join('-')}`;
  const customCategories = [...new Set(items.map((item) => item.category).filter((category) => category && !CATEGORY_ORDER.includes(category)))];

  useEffect(() => {
    if (!categoryStorageKey || categoryStorageKey.endsWith('_')) return;
    const stored = localStorage.getItem(categoryStorageKey);
    if (stored !== null) {
      try {
        setCategoryHistory(JSON.parse(stored));
      } catch {
        setCategoryHistory([]);
      }
    } else {
      // 首次使用：用一个「初始快捷方式」列表，用户之后可自由增删
      const initial = CATEGORY_ORDER.slice();
      setCategoryHistory(initial);
      localStorage.setItem(categoryStorageKey, JSON.stringify(initial));
    }
  }, [categoryStorageKey]);

  const rememberCategory = (category) => {
    const value = String(category || '').trim();
    if (!value) return;
    setCategoryHistory((prev) => {
      // 最高 10 条，最近的排在最前（包含用户新输入的分类，也包含可重复加入的预设）
      const next = [value, ...prev.filter((c) => c !== value)].slice(0, 10);
      localStorage.setItem(categoryStorageKey, JSON.stringify(next));
      return next;
    });
  };

  const removeCategoryShortcut = (category) => {
    setCategoryHistory((prev) => {
      const next = prev.filter((c) => c !== category);
      localStorage.setItem(categoryStorageKey, JSON.stringify(next));
      return next;
    });
  }; 

  const sharedBanner = user?.cover || partner?.cover || '';
  const bannerImage = sharedBanner || items.find((item) => item.image)?.image || '';

  const listRef = useRef(null);
  const sectionRefs = useRef({});
  const categoriesRef = useRef([]);
  // 程序滚动期间锁定 onScroll 的高亮更新，防止点击分类被滚动中间态覆盖
  const scrollLockRef = useRef(false);
  const scrollTimerRef = useRef(null);
  const [activeCat, setActiveCat] = useState('');
  // 记录已应用的最高菜单版本号，用于跳过重复/旧/乱序的实时快照
  const lastRevRef = useRef(0);

  /* ---------- 数据加载 ---------- */
  // 统一入口：应用最新菜单快照并记录版本号（供实时更新去重）
  const applyMenu = useCallback((list, rev = 0) => {
    if (rev > lastRevRef.current) lastRevRef.current = rev;
    setItems(list);
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const data = await api.menu();
      applyMenu(data.items || [], data.rev || 0);
      // 预加载并写入缓存：让列表展示走缓存、不逐个蹦出
      const map = await preloadMenuImages(data.items || []);
      setImageMap(map);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, applyMenu]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // 加载顶部统计：完成单数 + 对方平均评分 + 最近一次点餐
  const loadStats = useCallback(async () => {
    try {
      const data = await api.orderStats();
      setStats({
        doneOrders: data.doneOrders || 0,
        avgRating: data.avgRating ?? null,
        lastOrderAt: data.lastOrderAt || null,
      });
    } catch {
      /* 统计加载失败不阻塞页面 */
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // 实时刷新统计：对方评分/订单状态变化时同步
  useEffect(() => {
    const s = getSocket();
    if (!s || !socketReady) return;
    const onRated = (payload) => {
      loadStats();
      const orderId = payload?.orderId;
      pushSystemNotification({
        title: '收到新评分',
        body: payload?.rating ? `对方给你的点餐打了 ${payload.rating} 分，快去看看` : '对方刚刚为你的点餐打了分，快去看看',
        id: 3000,
        data: {
          path: orderId ? `/app/orders/${orderId}` : '/app/orders',
        },
      });
    };
    s.on('order:rated', onRated);
    s.on('order:updated', loadStats);
    return () => {
      s.off('order:rated', onRated);
      s.off('order:updated', loadStats);
    };
  }, [socketReady, loadStats]);

  // 已连接后，首次进入菜单页自动向服务端请求一次最新快照，
  // 补偿重连/首次进入时可能遗漏的实时更新
  useEffect(() => {
    if (!socketReady) return;
    requestMenu();
  }, [socketReady]);

  // 对方在线状态：用于右侧状态容器
  useEffect(() => {
    const s = getSocket();
    if (!s || !socketReady || !partner?.id) return;
    const init = () => setPartnerOnline(true);
    const onPresence = ({ userId, online }) => {
      if (userId === partner.id) setPartnerOnline(!!online);
    };
    s.on('presence:update', onPresence);
    init();
    return () => s.off('presence:update', onPresence);
  }, [socketReady, partner?.id]);

  // 实时监听对方对菜单的修改（新增/编辑/删除/上下架）。
  // 基于配对房间收到广播后，用版本号去重并直接替换快照，避免整页闪烁。
  useEffect(() => {
    const s = getSocket();
    if (!s || !socketReady) return;
    const onMenuUpdate = ({ rev, items: updated, by }) => {
      if (!Array.isArray(updated)) return;
      if (rev !== undefined) {
        if (rev <= lastRevRef.current) return; // 重复或较旧的数据，忽略
        lastRevRef.current = rev;
      }
      // 对方修改菜单时触发系统通知（配对房间广播包含自己，by 为操作者）
      if (by && by !== user?.id) {
        pushSystemNotification({
          title: '菜单已更新',
          body: '对方刚刚更新了菜单，看看有什么变化',
          id: 4002,
          data: { path: '/app/menu' },
        });
      }
      // 仅当内容真正变化时才更新，避免无谓重渲染/闪烁
      setItems((prev) => {
        const same =
          prev.length === updated.length &&
          prev.every((p, i) => {
            const u = updated[i];
            return (
              p.id === u.id && p.name === u.name && p.price === u.price &&
              p.category === u.category && p.available === u.available &&
              p.description === u.description && p.image === u.image
            );
          });
        return same ? prev : updated;
      });
    };
    s.on('menu:update', onMenuUpdate);
    return () => {
      s.off('menu:update', onMenuUpdate);
    };
  }, [socketReady, user?.id]);

  // 菜单数据变化（含实时同步）时，后台补全新增图片的本地缓存与展示映射，
  // 并清理已不在菜单中的展示映射（删除菜品后不留残留）。
  const preparedImagesRef = useRef(new Set());
  useEffect(() => {
    const activeUrls = new Set(items.map((i) => i.image).filter(Boolean));
    // 清除已删除菜品的展示映射
    setImageMap((prev) => {
      const next = new Map();
      prev.forEach((v, k) => {
        if (activeUrls.has(k)) next.set(k, v);
      });
      return next;
    });

    const todo = items.filter((i) => i.image && !preparedImagesRef.current.has(i.image));
    if (!todo.length) return;

    // 后台补缓存
    const update = async () => {
      const map = await preloadMenuImages(todo);
      setImageMap((prev) => {
        const next = new Map(prev);
        map.forEach((v, k) => next.set(k, v));
        return next;
      });
    };
    update().finally(() => {
      todo.forEach((i) => preparedImagesRef.current.add(i.image));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  /* 分类：有菜品的分类才展示 */
  const categories = sortCategories(items.map((i) => i.category));
  categoriesRef.current = categories;
  const itemsByCat = categories.reduce((acc, cat) => {
    acc[cat] = items.filter((i) => i.category === cat);
    return acc;
  }, {});

  /* ---------- 分类与列表滚动联动 ---------- */
  useEffect(() => {
    if (categories.length && !categories.includes(activeCat)) {
      setActiveCat(categories[0]);
    }
  }, [categories, activeCat]);

  // 平滑滚动真正结束时及时释放锁（scrollend 是标准事件，定时器仅兜底）
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const onScrollEnd = () => {
      scrollLockRef.current = false;
      clearTimeout(scrollTimerRef.current);
    };
    container.addEventListener('scrollend', onScrollEnd);
    return () => container.removeEventListener('scrollend', onScrollEnd);
  }, []);

  const scrollToCategory = (cat) => {
    const container = listRef.current;
    const el = sectionRefs.current[cat];
    if (!container || !el) return;
    setActiveCat(cat);
    // 平滑滚动期间会持续触发 onScroll，若不加锁，中间态会把高亮覆盖回旧分类，
    // 导致第一次点击看起来没反应（要再点一次）。
    scrollLockRef.current = true;
    clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      scrollLockRef.current = false;
    }, 600);
    container.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
  };

  const onListScroll = useCallback(() => {
    // 程序滚动（点击分类）进行中：忽略，避免覆盖用户刚点击的高亮
    if (scrollLockRef.current) return;
    const container = listRef.current;
    if (!container) return;

    // 以「顶部标题线」作为判定点：吸顶分类标题下方一点。
    // 分类标题是 sticky 元素，滚动目标以标题线对齐（而非视口中部），
    // 这样即便分类很短，高亮也能与滚动位置严格对应。
    const headerOffset = 42; // 标题吸顶高度 + 少量向下余量，与右侧 h3 的 sticky top-0 对应
    const probeLine = container.scrollTop + headerOffset;
    let current = '';
    for (const cat of categoriesRef.current) {
      const el = sectionRefs.current[cat];
      if (el && el.offsetTop <= probeLine) current = cat;
    }
    if (!current) current = categoriesRef.current[0] || '';
    setActiveCat((prev) => (prev === current ? prev : current));
  }, []);

  /* ---------- 搜索 ---------- */
  const query = search.trim().toLowerCase();
  const isSearching = query.length > 0;
  const searchResults = isSearching
    ? items.filter(
        (i) => i.name.toLowerCase().includes(query) || (i.description || '').toLowerCase().includes(query),
      )
    : [];

  /* ---------- 购物车与菜单同步（删除/下架/改价） ---------- */
  useEffect(() => {
    if (!items.length || !cart.length) return;
    const map = new Map(items.map((i) => [i.id, i]));
    let changed = false;
    const removed = [];
    const next = [];
    for (const ci of cart) {
      const m = map.get(ci.id);
      if (!m || !m.available) {
        changed = true;
        removed.push(ci.name);
        continue;
      }
      if (m.price !== ci.price || m.name !== ci.name || m.image !== ci.image) changed = true;
      next.push({ ...ci, name: m.name, price: m.price, image: m.image || '' });
    }
    if (changed) {
      setCart(next);
      if (removed.length) toast(`${removed.join('、')} 已下架，已从购物车移除`);
    }
  }, [items]); // 仅在菜单变化时同步购物车

  /* ---------- 管理模式操作 ---------- */
  const handleDelete = async (item) => {
    const ok = await confirm({
      title: '删除菜品',
      message: `确定删除「${item.name}」吗？\n删除后无法恢复，对方也会同步看到删除。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteMenuItem(item.id);
      toast('已删除');
      // 同步清除该菜品的本地图片缓存，避免残留占用空间
      purgeItemImageFromCache(item.image);
      loadItems();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleToggle = async (item) => {
    try {
      await api.toggleMenuItem(item.id);
      loadItems();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const cartQty = (id) => cart.find((x) => x.id === id)?.quantity || 0;

  // 顶部：沉浸式横幅 + 外卖平台风格信息卡
  const header = (
    <header className="relative shrink-0">
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-coral via-pinky to-rose sm:h-48">
        {bannerImage && (
          <img src={bannerImage} alt="菜单横幅" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/22 via-transparent to-black/40" />
      </div>

      <div className="relative mx-3 -mt-12 rounded-2xl bg-white px-4 pb-2.5 pt-2 shadow-soft">
        <div className="flex items-center gap-3">
          <Avatar user={user} size="lg" className="-mt-6 h-16 w-16 rounded-2xl border-4 border-white shadow-soft" />
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="truncate text-lg font-extrabold text-cocoa">我们的菜单</h1>
            <p className="mt-0.5 whitespace-nowrap text-xs font-medium leading-snug text-latte">
              {partner ? (
                <><span className="text-cocoa">{partner.name}</span> 一起点餐 · <span className="font-bold text-rose">{items.length}</span> 道菜</>
              ) : (
                '今天想吃什么？'
              )}
            </p>
          </div>
          {partner && (
            <span
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                partnerOnline ? 'bg-green-50 text-green-600' : 'bg-latte/10 text-latte'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  partnerOnline ? 'bg-green-500 animate-pulse-dot' : 'bg-latte'
                }`}
              />
              {partnerOnline ? '对方在线' : '对方离线'}
            </span>
          )}
        </div>
        {manageMode && !loading ? (
          <button
            onClick={() => setManageMode(false)}
            className="btn-ghost mt-3 w-full !py-2 text-xs !text-rose font-semibold"
          >
            完成管理
          </button>
        ) : (
          <>
            {/* 数据展示：一起完成的订单 + 对方评分 + 最近一次点餐（同行，保持卡片高度） */}
            <div className="mt-1.5 flex items-stretch gap-1">
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-blush/60 px-2 py-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-coral shadow-sm">
                  <IconCheck className="h-3 w-3" />
                </span>
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-[13px] font-extrabold leading-tight text-cocoa">{stats.doneOrders} 单</p>
                  <p className="leading-snug text-[9px] text-latte [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    完成订单
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-blush/60 px-2 py-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-rose shadow-sm">
                  <IconStar className="h-3 w-3" />
                </span>
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-[13px] font-extrabold leading-tight text-cocoa">
                    {stats.avgRating ? `${stats.avgRating.toFixed(1)} 分` : '—'}
                  </p>
                  <p className="leading-snug text-[9px] text-latte [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    对方评分
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-blush/60 px-2 py-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-coral shadow-sm">
                  <IconBell className="h-3 w-3" />
                </span>
                <div className="min-w-0">
                  <p className="whitespace-nowrap text-[13px] font-extrabold leading-tight text-cocoa">
                    {stats.lastOrderAt ? relativeTime(stats.lastOrderAt) : '—'}
                  </p>
                  <p className="leading-snug text-[9px] text-latte [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    最近一次点餐
                  </p>
                </div>
              </div>
            </div>
            <div className="relative mt-2">
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-latte/70" />
              <input
                className="input-field !rounded-xl !border-0 !bg-blush/60 !py-2.5 pl-10 text-xs"
                placeholder="搜索想吃的菜..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className="flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] flex-col">
        {header}
        {/* 列表区域：居中转圈加载 */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
          <Spinner size="lg" />
          <p className="mt-4 text-sm text-latte">正在加载菜单与图片...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] min-h-0 flex-col overflow-hidden">
      {/* 统一背景层：渐变 + 爱心装饰合并为一张连续背景，避免"内容盖住其中一层"产生色差 */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-gradient-to-br from-cream via-white to-blush/45" aria-hidden="true">
        <span className="absolute -left-5 top-16 h-32 w-32 rounded-full bg-coral/20 blur-3xl" />
        <span className="absolute -right-8 bottom-20 h-40 w-40 rounded-full bg-blush/80 blur-3xl" />
        <IconHeart className="absolute left-5 top-24 h-8 w-8 -rotate-12 text-coral/45" />
        <IconHeart className="absolute right-6 top-44 h-5 w-5 rotate-12 text-rose/30" />
        <IconHeart className="absolute -left-2 bottom-36 h-11 w-11 rotate-[-18deg] text-coral/30" />
        <IconHeart className="absolute right-10 bottom-32 h-9 w-9 rotate-6 text-rose/35" />
        <IconHeart className="absolute left-1/2 top-[55%] h-4 w-4 -translate-x-1/2 text-coral/25" />
        <IconHeart className="absolute left-16 top-12 h-4 w-4 rotate-12 text-rose/25" />
        <IconHeart className="absolute right-20 top-20 h-7 w-7 -rotate-6 text-coral/25" />
        <IconHeart className="absolute left-24 bottom-24 h-6 w-6 rotate-[-10deg] text-rose/25" />
        <IconHeart className="absolute right-2 bottom-48 h-4 w-4 rotate-[-16deg] text-coral/30" />
        <IconHeart className="absolute left-1/3 bottom-12 h-5 w-5 rotate-6 text-rose/20" />
      </div>

      {/* ===== 顶部：横幅 + 悬浮信息卡 ===== */}
      {header}

      {/* ===== 主体 ===== */}
      {!manageMode && items.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EmptyState onGoManage={() => setManageMode(true)} />
        </div>
      ) : manageMode ? (
        /* ---- 管理模式：平铺列表 ---- */
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
          <button
            onClick={() => { setEditItem(null); setShowForm(true); }}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-peach py-3 text-sm font-medium text-latte transition-colors hover:bg-blush"
          >
            <IconPlus className="h-4 w-4" /> 新增菜品
          </button>
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-latte">还没有菜品，点击上方按钮添加第一道菜吧</p>
          ) : (
          <div className="divide-y divide-peach/60 rounded-2xl bg-white px-4 shadow-card">
            {items.map((item) => (
              <div key={item.id} className="flex items-start gap-3 py-3">
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-blush">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-latte/30">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M21 3H3v18h18V3zm-4 5l-5 7-4-4-3 4V5h16v8l-4-5z" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 pt-px">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-cocoa">{item.name}</p>
                    <span className={`badge shrink-0 whitespace-nowrap ${item.available ? 'bg-green-100 text-green-600' : 'bg-latte/10 text-latte'}`}>
                      {item.available ? '售卖中' : '已下架'}
                    </span>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                    <span className="font-bold text-rose">¥{item.price.toFixed(2)}</span>
                    <span className="font-medium text-cocoa">{item.category}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <button onClick={() => handleToggle(item)} className="btn-ghost !px-2.5 !py-1 text-[11px]">
                      {item.available ? '下架' : '上架'}
                    </button>
                    <button onClick={() => { setEditItem(item); setShowForm(true); }} className="btn-ghost !px-2.5 !py-1 text-[11px]">
                      <IconEdit className="mr-1 inline h-3.5 w-3.5" />编辑
                    </button>
                    <button onClick={() => handleDelete(item)} className="btn-ghost !px-2.5 !py-1 text-[11px] !text-tangerine">
                      <IconDelete className="mr-1 inline h-3.5 w-3.5" />删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      ) : isSearching ? (
        /* ---- 搜索结果：单列列表 ---- */
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-32">
          <p className="px-1 py-2 text-xs font-medium text-latte">
            搜索「{search.trim()}」：找到 {searchResults.length} 道菜
          </p>
          {searchResults.length === 0 ? (
            <p className="py-16 text-center text-sm text-latte">没有找到相关菜品</p>
          ) : (
            <div className="divide-y divide-peach/60">
              {searchResults.map((item) => (
                <DishCard key={item.id} item={item} qty={cartQty(item.id)} displayImage={imageMap.get(item.image) || item.image} />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ---- 经典左右分栏：分类 + 菜品 ---- */
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* 左侧分类导航：透明背景，与右侧统一 */}
          <aside className="w-[5rem] shrink-0 overflow-y-auto overscroll-contain pb-24 scrollbar-none">
            {categories.map((cat) => {
              const isActive = activeCat === cat;
              return (
                <motion.button
                  key={cat}
                  onClick={() => scrollToCategory(cat)}
                  whileTap={{ scale: 0.96 }}
                  className={`relative flex w-full min-h-16 flex-col items-center justify-center gap-1 px-1.5 py-3 text-center text-[13px] leading-snug transition-colors ${
                    isActive ? 'bg-[#FFFFFF] font-bold text-rose' : 'text-[#9C8A90] hover:text-[#705F64]'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="cat-active-bar"
                      // 用 margin auto 垂直居中而非 transform，
                      // 避免与 framer-motion 的 layout 动画（接管 transform）冲突导致锚点偏移
                      className="absolute inset-y-0 left-0 my-auto h-7 w-1 rounded-r-full bg-gradient-to-b from-coral to-rose"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                  <span className="max-w-full whitespace-normal break-words leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                    {cat}
                  </span>
                </motion.button>
              );
            })}
          </aside>

          {/* 右侧菜品列表：整片统一浅暖粉白背景，消除色块断层 */}
          <section
            ref={listRef}
            onScroll={onListScroll}
            className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-xl px-3 pb-32"
          >
            {categories.map((cat) => (
              <section
                key={cat}
                ref={(el) => {
                  if (el) sectionRefs.current[cat] = el;
                  else delete sectionRefs.current[cat];
                }}
              >
                <h3 className="sticky top-0 z-10 border-b border-[#F4E7EA] bg-white/40 px-1 pb-2 pt-3 text-[15px] font-bold text-[#333333] backdrop-blur-sm">
                  {cat}
                </h3>
                <div className="divide-y divide-[#F4E7EA]">
                  {itemsByCat[cat].map((item) => (
                    <DishCard key={item.id} item={item} qty={cartQty(item.id)} displayImage={imageMap.get(item.image) || item.image} />
                  ))}
                </div>
              </section>
            ))}
          </section>
        </div>
      )}

      {/* ===== 底部购物车栏（管理模式不需要） ===== */}
      {!manageMode && <CartBar />}

      {/* ===== 菜品编辑弹窗 ===== */}
      {showForm && (
        <MenuItemForm
          item={editItem}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={(savedItem) => { rememberCategory(savedItem?.category); setShowForm(false); setEditItem(null); loadItems(); }}
          categoryHistory={categoryHistory}
          onCategoryRemove={removeCategoryShortcut}
        />
      )}
    </div>
  );
}