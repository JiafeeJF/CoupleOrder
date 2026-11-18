import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../ToastContext.jsx';
import { getSocket } from '../socket.js';
import { STATUS, formatTime, totalPrice } from '../constants.js';
import { IconCheck } from '../components/Icons.jsx';
import { ListLoading } from '../components/Spinner.jsx';
import { ItemThumb } from '../components/Cart.jsx';

function OrderCard({ order, isIncoming, onUpdateStatus }) {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const s = STATUS[order.status];
  const total = totalPrice(order.items);

  const advance = async (e) => {
    e.stopPropagation();
    if (!s.next) return;
    setBusy(true);
    try {
      await onUpdateStatus(order.id, s.next);
    } finally {
      setBusy(false);
    }
  };

  const openDetail = () => navigate(`/app/orders/${order.id}`);

  return (
    <button
      onClick={openDetail}
      className={`card block w-full max-w-full overflow-hidden p-4 text-left ${order.status === 'pending' && isIncoming ? 'ring-2 ring-coral/40' : ''}`}
    >
      {/* 头部 */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${isIncoming ? 'bg-gradient-to-br from-coral to-rose' : 'bg-gradient-to-br from-latte to-cocoa'}`}>
            {(isIncoming ? order.placedByName : '我').charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-cocoa">
              {isIncoming ? order.placedByName : '我点的'}
              <span className="ml-1 text-xs font-normal text-latte">#{order.id}</span>
            </p>
            <p className="truncate text-xs text-latte">{formatTime(order.createdAt)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`badge ${s.color}`}>
            <span className={`mr-1 h-1.5 w-1.5 rounded-full ${s.dot} ${order.status === 'pending' ? 'animate-pulse-dot' : ''}`} />
            {s.label}
          </span>
          <span className="text-latte">&gt;</span>
        </div>
      </div>

      {/* 菜品明细（带图片） */}
      <div className="mb-3 space-y-2 rounded-xl bg-blush/40 p-3">
        {order.items.map((it, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm">
            <ItemThumb image={it.image} name={it.name} size="sm" />
            <span className="min-w-0 flex-1 truncate text-cocoa">{it.name} <span className="text-xs text-latte">× {it.quantity}</span></span>
            <span className="shrink-0 text-latte">¥{(it.price * it.quantity).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-peach pt-2 text-sm font-bold">
          <span className="text-cocoa">合计</span>
          <span className="text-rose">¥{total.toFixed(2)}</span>
        </div>
      </div>

      {order.note && (
        <p className="mb-3 break-words rounded-xl bg-white px-3 py-2 text-xs text-latte">
          <span className="font-medium text-cocoa">备注：</span>{order.note}
        </p>
      )}

      {/* 操作按钮：接单方可见 */}
      {isIncoming && s.next && (
        <span
          onClick={advance}
          className="btn-primary inline-flex w-full justify-center gap-1.5 py-2.5 text-sm"
          role="button"
        >
          <IconCheck className="h-4 w-4" />
          {busy ? '更新中...' : `确认${s.nextLabel}`}
        </span>
      )}
      {isIncoming && !s.next && (
        <p className="text-center text-xs text-latte">已完成，为 TA 的用心点赞吧</p>
      )}
      {!isIncoming && order.status !== 'done' && (
        <p className="text-center text-xs text-latte">等待对方处理中...</p>
      )}
    </button>
  );
}

export default function Orders() {
  const { user, socketReady } = useAuth();
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('incoming');
  const listRef = useRef(null);

  const loadOrders = useCallback(async () => {
    try {
      const { orders: list } = await api.orders();
      setOrders(list);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadOrders();
    // 通知 Layout 清空待接单红点
    window.dispatchEvent(new Event('co:orders-viewed'));
  }, [loadOrders]);

  // 实时刷新（Socket 连接就绪后才会挂载监听）
  useEffect(() => {
    const s = getSocket();
    if (!s || !socketReady) return;
    const handler = () => loadOrders();
    s.on('order:new', handler);
    s.on('order:updated', handler);
    return () => {
      s.off('order:new', handler);
      s.off('order:updated', handler);
    };
  }, [loadOrders, socketReady]);

  // 点击顶部提示条时滚动到待接单区域
  useEffect(() => {
    const handler = () => {
      setTab('incoming');
      setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    };
    window.addEventListener('co:scroll-to-pending', handler);
    return () => window.removeEventListener('co:scroll-to-pending', handler);
  }, []);

  const updateStatus = async (id, status) => {
    try {
      await api.updateOrderStatus(id, status);
      toast('状态已更新');
      loadOrders();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const mine = orders.filter((o) => o.placedBy === user?.id);
  const incoming = orders.filter((o) => o.placedBy !== user?.id);
  const active = orders.filter((o) => o.status !== 'done');
  const done = orders.filter((o) => o.status === 'done');

  const tabs = [
    { id: 'incoming', label: '对方发来', list: incoming },
    { id: 'mine', label: '我发起', list: mine },
    { id: 'history', label: '历史', list: done },
  ];
  const current = tabs.find((t) => t.id === tab);

  const Empty = ({ text }) => (
    <div className="py-14 text-center">
      <p className="text-sm text-latte">{text}</p>
    </div>
  );

  return (
    <div className="w-full max-w-full overflow-x-hidden px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4">
      <h2 className="mb-4 text-xl font-extrabold text-cocoa">订单中心</h2>

      {/* 标签 */}
      <div className="mb-4 flex rounded-2xl bg-white p-1 shadow-card">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-gradient-to-r from-coral to-rose text-white shadow-sm' : 'text-latte'
            }`}
          >
            {t.label}
            {t.list.length > 0 && (
              <span className={`ml-1 text-xs ${tab === t.id ? 'text-white/80' : 'text-rose'}`}>({t.list.length})</span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key={`${tab}-loading`} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <ListLoading text="正在加载订单..." />
          </motion.div>
        ) : current.list.length === 0 ? (
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            <Empty
              text={
                tab === 'incoming' ? '暂时没有 TA 发来的订单' :
                tab === 'mine' ? '你还没有发起过订单' :
                '还没有历史订单'
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key={tab}
            ref={listRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="space-y-3"
          >
            {current.list.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                isIncoming={tab === 'incoming'}
                onUpdateStatus={updateStatus}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 提示文案 */}
      {tab === 'incoming' && incoming.some((o) => o.status === 'pending') && (
        <p className="mt-4 text-center text-xs text-latte">
          新订单会实时推送并邮件通知，记得及时接单哦
        </p>
      )}
    </div>
  );
}