import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../ToastContext.jsx';
import { getSocket } from '../socket.js';
import { STATUS, formatTime, totalPrice } from '../constants.js';
import { ItemThumb } from '../components/Cart.jsx';
import Modal from '../components/Modal.jsx';
import { IconArrowLeft, IconCheck, IconHeart, IconStar } from '../components/Icons.jsx';

// 半星选择器：每颗星分左右两半，点击左半=星数-0.5，右半=整星
function StarPicker({ value, onChange }) {
  return (
    <div className="flex justify-center gap-0.5 py-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="relative h-9 w-9">
          <button
            type="button"
            aria-label={`${n - 0.5} 星`}
            onClick={() => onChange(n - 0.5)}
            className="absolute left-0 top-0 z-10 h-full w-1/2"
          />
          <button
            type="button"
            aria-label={`${n} 星`}
            onClick={() => onChange(n)}
            className="absolute right-0 top-0 z-10 h-full w-1/2"
          />
          <IconStar className={`h-9 w-9 ${value >= n ? 'text-amber-400' : 'text-peach'}`} />
          {/* 半星遮罩：值落在 n-0.5 ~ n 之间时，只填充左半 */}
          {value >= n - 0.5 && value < n && (
            <span className="pointer-events-none absolute left-0 top-0 h-full w-1/2 overflow-hidden">
              <IconStar className="h-9 w-9 text-amber-400" />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// 半星展示（只读）
function StarDisplay({ value }) {
  return (
    <div className="flex justify-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <div key={n} className="relative h-6 w-6">
          <IconStar className={`h-6 w-6 ${value >= n ? 'text-amber-400' : 'text-peach'}`} />
          {value >= n - 0.5 && value < n && (
            <span className="pointer-events-none absolute left-0 top-0 h-full w-1/2 overflow-hidden">
              <IconStar className="h-6 w-6 text-amber-400" />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const { user, socketReady } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // 评分弹窗状态
  const [rateOpen, setRateOpen] = useState(false);
  const [star, setStar] = useState(0);
  const [comment, setComment] = useState('');
  const [submittingRate, setSubmittingRate] = useState(false);

  const orderId = Number(id);
  const isIncoming = order ? order.placedBy !== user?.id : false;
  const s = order ? STATUS[order.status] : null;
  const total = order ? totalPrice(order.items) : 0;
  // 当前用户是否已评分
  const myRating = order ? (order.ratings || []).find((r) => r.by === user?.id) : null;
  // 对方对这单的评分（另一方的评价）
  const partnerRating = order ? (order.ratings || []).find((r) => r.by !== user?.id) : null;
  const canRate = !!order && order.status === 'done' && !myRating;

  const loadOrder = useCallback(async () => {
    try {
      const { orders } = await api.orders();
      const found = orders.find((o) => o.id === orderId);
      setOrder(found || null);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [orderId, toast]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  // 实时刷新状态
  useEffect(() => {
    const sk = getSocket();
    if (!sk || !socketReady) return;
    const handler = () => loadOrder();
    sk.on('order:updated', handler);
    sk.on('order:rated', handler);
    return () => {
      sk.off('order:updated', handler);
      sk.off('order:rated', handler);
    };
  }, [loadOrder, socketReady]);

  const advance = async () => {
    if (!order || !s?.next) return;
    setBusy(true);
    try {
      await api.updateOrderStatus(order.id, s.next);
      toast('状态已更新');
      loadOrder();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const openRate = () => {
    setStar(0);
    setComment('');
    setRateOpen(true);
  };

  const submitRate = async () => {
    if (star < 1) return toast('请选择星级', 'error');
    setSubmittingRate(true);
    try {
      await api.rateOrder(order.id, { rating: star, comment: comment.trim() });
      toast('感谢你的评分！');
      setRateOpen(false);
      loadOrder();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmittingRate(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-peach border-t-coral" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="w-full max-w-full overflow-x-hidden px-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <button onClick={() => navigate('/app/orders')} className="btn-ghost -ml-1 mb-4 flex items-center gap-1 p-1 text-sm text-latte">
          <IconArrowLeft className="h-5 w-5" /> 返回订单中心
        </button>
        <div className="flex min-h-[50vh] flex-col items-center justify-center">
          <IconHeart className="h-10 w-10 text-rose" />
          <p className="mt-3 text-sm text-latte">订单不存在或已删除</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+1rem)]">
      {/* 顶部：返回 + 状态 */}
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => navigate('/app/orders')} className="btn-ghost -ml-1 p-1">
          <IconArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-extrabold text-cocoa">订单详情</h2>
        <span className={`badge ml-auto ${s.color}`}>
          <span className={`mr-1 h-1.5 w-1.5 rounded-full ${s.dot} ${order.status === 'pending' ? 'animate-pulse-dot' : ''}`} />
          {s.label}
        </span>
      </div>

      {/* 订单信息 */}
      <div className="card mb-4 p-4">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-bold text-white ${isIncoming ? 'bg-gradient-to-br from-coral to-rose' : 'bg-gradient-to-br from-latte to-cocoa'}`}>
            {(isIncoming ? order.placedByName : '我').charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-cocoa">
              {isIncoming ? `${order.placedByName} 点的` : '我点的'}
              <span className="ml-1 text-xs font-normal text-latte">#{order.id}</span>
            </p>
            <p className="mt-0.5 text-xs text-latte">
              下单时间：{formatTime(order.createdAt)}
              {order.updatedAt && order.updatedAt !== order.createdAt && (
                <span className="ml-2">更新：{formatTime(order.updatedAt)}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* 商品列表 */}
      <div className="card mb-4 overflow-hidden">
        <p className="border-b border-peach px-4 py-3 text-sm font-bold text-cocoa">商品明细</p>
        <ul className="divide-y divide-peach/70 px-4">
          {order.items.map((it, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className="flex items-center gap-3 py-3"
            >
              <ItemThumb image={it.image} name={it.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-cocoa">{it.name}</p>
                <p className="mt-0.5 text-xs text-latte">
                  ¥{it.price.toFixed(2)} <span className="mx-1 text-peach">×</span> {it.quantity}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold text-cocoa">¥{(it.price * it.quantity).toFixed(2)}</p>
            </motion.li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-peach bg-blush/40 px-4 py-3">
          <span className="text-sm font-bold text-cocoa">合计</span>
          <span className="text-lg font-extrabold text-rose">¥{total.toFixed(2)}</span>
        </div>
      </div>

      {/* 备注 */}
      {order.note && (
        <div className="card mb-4 p-4">
          <p className="mb-1 text-xs font-medium text-latte">备注</p>
          <p className="break-words text-sm leading-relaxed text-cocoa">{order.note}</p>
        </div>
      )}

      {/* 操作按钮：接单方可见 */}
      {isIncoming && s.next && (
        <button onClick={advance} disabled={busy} className="btn-primary w-full gap-1.5 py-3 text-sm">
          <IconCheck className="h-4 w-4" />
          {busy ? '更新中...' : `确认${s.nextLabel}`}
        </button>
      )}
      {isIncoming && !s.next && (
        <p className="py-4 text-center text-xs text-latte">已完成，为 TA 的用心点赞吧</p>
      )}
      {!isIncoming && order.status !== 'done' && (
        <p className="py-4 text-center text-xs text-latte">等待对方处理中...</p>
      )}

      {/* 评分：订单完成后展示 */}
      {order.status === 'done' && (
        <div className="card mb-4 mt-1 p-4 text-center">
          {/* 对方这单给你的评分 */}
          {partnerRating ? (
            <div className="mb-4 border-b border-peach pb-4">
              <p className="text-sm font-semibold text-cocoa">{isIncoming ? 'TA 给你这单的评分' : '对方给你这单的评分'}</p>
              <div className="mt-2">
                <StarDisplay value={partnerRating.rating} />
              </div>
              {partnerRating.comment && (
                <p className="mt-2 text-xs leading-relaxed text-latte">「{partnerRating.comment}」</p>
              )}
            </div>
          ) : order.status === 'done' && !myRating && (
            <p className="mb-4 text-xs text-latte">对方还未给这单评分</p>
          )}
          {myRating ? (
            <>
              <p className="text-sm font-semibold text-cocoa">你已为这单评分</p>
              <div className="mt-2">
                <StarDisplay value={myRating.rating} />
              </div>
              {myRating.comment && (
                <p className="mt-2 text-xs leading-relaxed text-latte">「{myRating.comment}」</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-cocoa">这单吃得开心吗？</p>
              <p className="mt-1 text-xs text-latte">给 TA 的用心打个分吧</p>
              <button
                onClick={openRate}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-coral to-rose px-5 py-2 text-sm font-semibold text-white shadow-soft active:scale-95"
              >
                <IconStar className="h-4 w-4" />
                去评分
              </button>
            </>
          )}
        </div>
      )}

      {/* 评分弹窗 */}
      <Modal open={rateOpen} onClose={() => setRateOpen(false)} title="为这单评分">
        <div className="space-y-4">
          <StarPicker value={star} onChange={setStar} />
          <p className="text-center text-xs text-latte">
            {star ? `选了 ${star % 1 === 0 ? star : star.toFixed(1)} 星` : '点击星星选择评分（支持半星）'}
          </p>
          <input
            className="input-field"
            placeholder="说点什么吧（选填）"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={100}
          />
          <button onClick={submitRate} disabled={submittingRate} className="btn-primary w-full">
            {submittingRate ? '提交中...' : '提交评分'}
          </button>
        </div>
      </Modal>
    </div>
  );
}