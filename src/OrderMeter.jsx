import { memo, useState } from "react";

// How much of the law the picture still obeys (see order.js). Click to see
// which laws are broken, in the validator's own words.
function OrderMeter({ order }) {
  const [open, setOpen] = useState(false);
  const percent = Math.round(order.order * 100);

  return (
    <button
      type="button"
      className="order-meter"
      aria-expanded={open}
      title={`${order.kept} of ${order.total} laws of place kept`}
      onClick={() => setOpen((v) => !v)}
    >
      <span className="order-meter-head">
        <span>Order</span>
        <span>{percent}%</span>
      </span>
      <span className="order-meter-track">
        <span className="order-meter-fill" style={{ width: `${percent}%` }} />
      </span>
      {open && (
        <span className="order-meter-laws">
          {order.broken.length === 0 && <span>every law holds</span>}
          {order.broken.map((violation) => (
            <span key={violation.code}>{violation.message}</span>
          ))}
        </span>
      )}
    </button>
  );
}

export default memo(OrderMeter);
