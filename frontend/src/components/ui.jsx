
import React, { createContext, useContext, useState, useCallback } from 'react';

/* ---------------- TOAST ---------------- */
const ToastCtx = createContext(function () {});
export function ToastProvider(props) {
  const [items, setItems] = useState([]);
  const push = useCallback(function (msg, type) {
    const id = Math.random().toString(36).slice(2);
    setItems(function (prev) { return prev.concat([{ id: id, msg: msg, type: type || 'info' }]); });
    setTimeout(function () {
      setItems(function (prev) { return prev.filter(function (i) { return i.id !== id; }); });
    }, 3800);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {props.children}
      <div className="toast-wrap">
        {items.map(function (i) {
          return <div key={i.id} className={'toast toast-' + i.type}>{i.msg}</div>;
        })}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() { return useContext(ToastCtx); }

/* ---------------- PRIMITIVES ---------------- */
export function Card(props) {
  return (
    <div className={'card ' + (props.className || '')} style={props.style}>
      {(props.title || props.actions) ? (
        <div className="card-head">
          <div>
            <h3>{props.title}</h3>
            {props.subtitle ? <p>{props.subtitle}</p> : null}
          </div>
          {props.actions ? <div className="row">{props.actions}</div> : null}
        </div>
      ) : null}
      {props.children}
    </div>
  );
}

export function Stat(props) {
  return (
    <div className="stat">
      <div className="label">{props.label}</div>
      <div className="value">{props.value}</div>
      {props.hint ? <div className="hint">{props.hint}</div> : null}
    </div>
  );
}

export function Badge(props) {
  return <span className={'badge badge-' + (props.tone || 'gray')}>{props.children}</span>;
}

export function statusTone(status) {
  if (status === 'approved') return 'green';
  if (status === 'pending') return 'amber';
  if (status === 'rejected') return 'red';
  if (status === 'edited') return 'blue';
  if (status === 'processed') return 'cyan';
  return 'gray';
}

export function Button(props) {
  const cls = 'btn btn-' + (props.variant || 'ghost') + (props.size === 'sm' ? ' btn-sm' : '') +
    (props.block ? ' btn-block' : '') + (props.className ? ' ' + props.className : '');
  return (
    <button className={cls} onClick={props.onClick} disabled={props.disabled} type={props.type || 'button'}>
      {props.children}
    </button>
  );
}

export function Spinner(props) {
  return (
    <div className="spinner-wrap">
      <div className="spinner"></div>
      <span>{props.label || 'Loading...'}</span>
    </div>
  );
}

export function EmptyState(props) {
  return (
    <div className="empty">
      <div className="ico">{props.icon || '📭'}</div>
      <h4>{props.title || 'Nothing here yet'}</h4>
      <p className="small">{props.message || ''}</p>
      {props.action ? <div className="mt-16">{props.action}</div> : null}
    </div>
  );
}

export function Progress(props) {
  const v = Math.max(0, Math.min(100, props.value || 0));
  const tone = props.tone || (v >= 75 ? 'green' : v >= 50 ? 'amber' : 'red');
  return (
    <div className={'progress ' + (props.plain ? '' : tone)}>
      <span style={{ width: v + '%' }}></span>
    </div>
  );
}

export function Field(props) {
  return (
    <div className="field">
      {props.label ? <label>{props.label}</label> : null}
      {props.children}
      {props.hint ? <div className="tiny muted mt-8">{props.hint}</div> : null}
    </div>
  );
}

export function Modal(props) {
  if (!props.open) return null;
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={function (e) { e.stopPropagation(); }}>
        <div className="modal-head">
          <h3>{props.title}</h3>
          <button className="x-btn" onClick={props.onClose}>×</button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer ? <div className="modal-foot">{props.footer}</div> : null}
      </div>
    </div>
  );
}

export function PageHeader(props) {
  return (
    <div className="row-between mb-16 wrap">
      <div>
        <h2 style={{ margin: 0, fontSize: '20px', letterSpacing: '-.4px' }}>{props.title}</h2>
        {props.subtitle ? <div className="small muted mt-8">{props.subtitle}</div> : null}
      </div>
      <div className="row wrap">{props.actions}</div>
    </div>
  );
}

export function ScoreRing(props) {
  const v = Math.round(props.value || 0);
  const tone = v >= 75 ? '#4ade80' : v >= 50 ? '#fbbf24' : '#f87171';
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="score-big" style={{ color: tone }}>{v}</div>
      <div className="tiny muted" style={{ marginTop: '4px' }}>{props.label || 'out of 100'}</div>
    </div>
  );
}

export function MetricBar(props) {
  const v = Math.round(props.value || 0);
  return (
    <div className="metric-row">
      <div className="name">{props.name}</div>
      <div className="bar"><Progress value={v} /></div>
      <div className="val">{v}%</div>
    </div>
  );
}
