export const STATUS = {
  pending: { label: '待接单', next: 'accepted', nextLabel: '接单', color: 'bg-tangerine/15 text-tangerine', dot: 'bg-tangerine' },
  accepted: { label: '已接单', next: 'preparing', nextLabel: '开始制作', color: 'bg-pinky/15 text-pinky', dot: 'bg-pinky' },
  preparing: { label: '制作中', next: 'done', nextLabel: '完成', color: 'bg-coral/15 text-coral', dot: 'bg-coral' },
  done: { label: '已完成', next: null, nextLabel: '', color: 'bg-latte/15 text-latte', dot: 'bg-latte' },
};

export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function totalPrice(items) {
  return (items || []).reduce((s, it) => s + it.price * it.quantity, 0);
}
