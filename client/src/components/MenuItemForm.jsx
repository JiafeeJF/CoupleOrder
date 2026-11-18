import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { useToast } from '../ToastContext.jsx';
import { IconClose } from './Icons.jsx';
import { prepareMenuItemImage } from '../utils/image.js';

export const CATEGORY_ORDER = ['主食', '热菜', '凉菜', '小吃', '饮品', '甜品', '水果', '其他'];

export default function MenuItemForm({ item, onClose, onSave, categoryHistory = [], onCategoryRemove }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: item?.name || '',
    category: item?.category || '',
    price: item?.price ?? '',
    description: item?.description || '',
    image: item?.image || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [focused, setFocused] = useState(false);
  const categoryInputRef = useRef(null);
  // 自动显示/隐藏常用分类列表（聚焦显示、失焦自动收起）
  const showHistory = focused && !!categoryHistory.length;
  const hideTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  useLayoutEffect(() => {
    const el = categoryInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [form.category]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // 前端先自动压缩图片，再放入表单待提交
  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('请选择图片文件', 'error');
    if (file.size > 10 * 1024 * 1024) return toast('原图不能超过 10MB', 'error'); // 压缩后会显著变小
    setCompressing(true);
    try {
      const dataUrl = await prepareMenuItemImage(file);
      setForm((f) => ({ ...f, image: dataUrl }));
    } catch {
      toast('图片处理失败，请换一张试试', 'error');
    } finally {
      setCompressing(false);
      e.target.value = ''; // 允许重复选择同一文件
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || form.price === '' || form.price === null) return toast('名称和价格不能为空', 'error');
    const p = Number(form.price);
    if (isNaN(p) || p < 0) return toast('价格格式不正确', 'error');
    setSubmitting(true);
    try {
      const payload = { ...form, price: p };
      if (item) {
        await api.updateMenuItem(item.id, payload);
        toast('已更新');
      } else {
        await api.addMenuItem(payload);
        toast('已添加');
      }
      onSave({ ...payload, id: item?.id });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-white px-6 pb-8 pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-cocoa">{item ? '编辑菜品' : '新增菜品'}</h3>
          <button onClick={onClose} className="btn-ghost p-1"><IconClose /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-latte">名称 *</label>
            <input className="input-field" placeholder="菜名" value={form.name} onChange={set('name')} />
          </div>
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-latte">分类</label>
            <textarea
              ref={categoryInputRef}
              className="input-field min-h-12 resize-none overflow-hidden leading-snug"
              maxLength={20}
              value={form.category}
              onChange={set('category')}
              onFocus={() => {
                clearTimeout(hideTimerRef.current);
                setFocused(true);
              }}
              onBlur={() => {
                // 延迟收起，保证点击下拉项（会先触发 blur）仍能生效
                hideTimerRef.current = setTimeout(() => setFocused(false), 150);
              }}
              placeholder="点击下方常用分类，或手动输入新分类"
              rows={1}
            />
            {/* 悬浮下拉：聚焦时自动显示，失焦自动收起，不占用弹窗高度 */}
            {showHistory && (
              <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-peach/70 bg-white shadow-soft">
                <p className="flex items-center justify-between border-b border-peach/60 px-3 py-2 text-[11px] font-medium text-latte">
                  <span>常用分类</span>
                  <span className="text-[10px]">{categoryHistory.length} 个</span>
                </p>
                <ul className="max-h-36 divide-y divide-peach/60 overflow-y-auto pr-1">
                  {categoryHistory.map((c) => (
                    <li key={c} className="flex items-center gap-1 py-0.5 pl-1 pr-3">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setForm((f) => ({ ...f, category: c }));
                          clearTimeout(hideTimerRef.current);
                          setFocused(false);
                        }}
                        className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                          form.category === c ? 'bg-blush/70 text-rose' : 'text-cocoa hover:bg-blush/40'
                        }`}
                      >
                        <span className="block truncate">{c}</span>
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onCategoryRemove && onCategoryRemove(c)}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-latte transition-colors hover:bg-blush hover:text-tangerine"
                        aria-label={`删除分类 ${c}`}
                      >
                          ×
                        </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-latte">价格 *</label>
            <input className="input-field" type="number" step="0.01" min="0" placeholder="0.00" value={form.price} onChange={set('price')} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-latte">描述</label>
            <textarea className="input-field resize-none" rows={2} placeholder="简短的描述..." value={form.description} onChange={set('description')} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-latte">图片（可选，选择后自动压缩）</label>
            <input className="input-field file:mr-2 file:rounded-lg file:border-0 file:bg-blush file:px-3 file:py-1 file:text-xs file:font-medium file:text-cocoa disabled:opacity-50" type="file" accept="image/*" onChange={handleImageFile} disabled={compressing} />
            <div className="mt-2 flex items-center gap-3">
              {form.image && form.image.startsWith('data:') && (
                <img src={form.image} alt="预览" className="h-20 w-20 rounded-xl object-cover shadow-card" />
              )}
              {compressing && (
                <p className="flex items-center gap-2 text-xs text-latte">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-peach border-t-coral" />
                  正在压缩图片...
                </p>
              )}
              {form.image && form.image.startsWith('data:') && !compressing && (
                <span className="text-xs text-latte">
                  ≈{(form.image.length * 0.75 / 1024).toFixed(0)}KB
                </span>
              )}
            </div>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? '保存中...' : (item ? '保存修改' : '添加菜品')}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}