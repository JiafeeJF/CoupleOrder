import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCart } from '../CartContext.jsx';
import { useToast } from '../ToastContext.jsx';
import { api } from '../api.js';
import { Stepper, ItemThumb } from '../components/Cart.jsx';
import { IconArrowLeft } from '../components/Icons.jsx';

export default function Checkout() {
  const { cart, count, total, addToCart, decrease, clearCart } = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!cart.length) return toast('购物车是空的', 'error');
    setSubmitting(true);
    try {
      await api.createOrder({
        items: cart.map((x) => ({ menuItemId: x.id, quantity: x.quantity })),
        note,
      });
      toast('下单成功，已实时通知 TA 并发送邮件！');
      clearCart();
      navigate('/app/orders', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!cart.length) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <p className="text-sm text-latte">购物车是空的，先去选点好吃的吧</p>
        <button onClick={() => navigate('/app/menu')} className="btn-primary mt-5 px-8">
          去点餐
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4">
      {/* 顶部：返回 + 标题 */}
      <div className="mb-4 flex items-center gap-3">
        <button onClick={() => navigate('/app/menu')} className="btn-ghost -ml-1 p-1">
          <IconArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-xl font-extrabold text-cocoa">确认订单</h2>
      </div>

      {/* 商品列表 */}
      <div className="card mb-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-peach px-4 py-3">
          <p className="text-sm font-bold text-cocoa">已选商品</p>
          <span className="text-xs text-latte">共 {count} 件</span>
        </div>
        <ul className="divide-y divide-peach/70 px-4">
          {cart.map((it) => (
            <motion.li
              key={it.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3 py-3"
            >
              <ItemThumb image={it.image} name={it.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-cocoa">{it.name}</p>
                <p className="mt-0.5 text-xs text-latte">
                  <span className="text-rose">¥{it.price.toFixed(2)}</span> / 份
                </p>
              </div>
              <div className="text-right">
                <Stepper
                  qty={it.quantity}
                  size="sm"
                  onAdd={() => addToCart(it)}
                  onDec={() => decrease(it.id)}
                />
                <p className="mt-1 text-xs font-semibold text-cocoa">
                  小计 ¥{(it.price * it.quantity).toFixed(2)}
                </p>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>

      {/* 备注 */}
      <div className="card mb-4 p-4">
        <label className="mb-1.5 block text-xs font-medium text-latte">备注</label>
        <textarea
          className="input-field resize-none py-2.5 text-xs"
          rows={2}
          placeholder="给 TA 留个备注（可选）"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* 底部占位，防止被提交栏遮挡 */}
      <div className="h-24" />

      {/* 底部提交栏 */}
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-soft ring-1 ring-peach">
          <div>
            <p className="text-xs text-latte">合计</p>
            <p className="text-xl font-extrabold text-rose">¥{total.toFixed(2)}</p>
          </div>
          <motion.button
            onClick={submit}
            whileTap={{ scale: 0.96 }}
            disabled={submitting}
            className="rounded-xl bg-gradient-to-r from-coral to-rose px-8 py-3 text-sm font-bold text-white shadow-sm disabled:opacity-50"
          >
            {submitting ? '提交中...' : '提交订单'}
          </motion.button>
        </div>
      </div>
    </div>
  );
}