import{j as e}from"./jsx-runtime-Z5uAzocK.js";import{r}from"./index-pP6CS22B.js";/* empty css               */import"./_commonjsHelpers-Cpj98o6Y.js";function Q(n){const t=r.useRef(null),a=r.useRef(null);return r.useEffect(()=>{if(!n)return;a.current=document.activeElement;const i=t.current;if(i){const s=A(i);s.length>0?s[0].focus():i.focus()}const c=s=>{if(s.key!=="Tab")return;const m=t.current;if(!m)return;const d=A(m);if(d.length===0){s.preventDefault();return}const l=d[0],p=d[d.length-1];s.shiftKey?document.activeElement===l&&(s.preventDefault(),p.focus()):document.activeElement===p&&(s.preventDefault(),l.focus())};return document.addEventListener("keydown",c),()=>{document.removeEventListener("keydown",c),a.current&&typeof a.current.focus=="function"&&a.current.focus()}},[n]),t}function A(n){const t=["a[href]","button:not([disabled])","input:not([disabled])","select:not([disabled])","textarea:not([disabled])",'[tabindex]:not([tabindex="-1"])'].join(", ");return Array.from(n.querySelectorAll(t)).filter(a=>a.offsetParent!==null&&!a.getAttribute("aria-hidden"))}function o({isOpen:n,onClose:t,title:a,children:i,size:c="md",closeOnOverlayClick:s=!0,closeOnEscape:m=!0,showCloseButton:d=!0,className:l="","aria-describedby":p,...C}){const j=r.useId(),N=r.useId(),G=Q(n);r.useEffect(()=>{if(!n||!m)return;const u=w=>{w.key==="Escape"&&(w.stopPropagation(),t())};return document.addEventListener("keydown",u),()=>document.removeEventListener("keydown",u)},[n,m,t]),r.useEffect(()=>{if(!n)return;const u=document.body.style.overflow;return document.body.style.overflow="hidden",()=>{document.body.style.overflow=u}},[n]);const H=r.useCallback(u=>{s&&u.target===u.currentTarget&&t()},[s,t]);return n?e.jsx("div",{className:"ds-modal-overlay",onClick:H,role:"presentation","data-state":n?"open":"closed",children:e.jsxs("div",{ref:G,role:"dialog","aria-modal":"true","aria-labelledby":j,"aria-describedby":p||N,className:`ds-modal ds-modal--${c} ${l}`.trim(),tabIndex:-1,...C,children:[e.jsxs("div",{className:"ds-modal__header",children:[e.jsx("h2",{id:j,className:"ds-modal__title",children:a}),d&&e.jsx("button",{type:"button",className:"ds-modal__close",onClick:t,"aria-label":"Close dialog",children:e.jsx("svg",{viewBox:"0 0 24 24",width:"20",height:"20",fill:"none",stroke:"currentColor",strokeWidth:"2",children:e.jsx("path",{d:"M18 6L6 18M6 6l12 12"})})})]}),e.jsx("div",{id:N,className:"ds-modal__content",children:i})]})}):null}function X({children:n,align:t="right",className:a=""}){return e.jsx("div",{className:`ds-modal__actions ds-modal__actions--${t} ${a}`.trim(),children:n})}o.Actions=X;function U({isOpen:n,onClose:t,onConfirm:a,title:i,message:c,confirmLabel:s="Confirm",cancelLabel:m="Cancel",variant:d="primary",loading:l=!1,disabled:p=!1}){const C=async()=>{try{await a(),t()}catch{}};return e.jsxs(o,{isOpen:n,onClose:l?void 0:t,title:i,size:"sm",children:[e.jsx("p",{className:"ds-modal__message",children:c}),e.jsxs(o.Actions,{children:[e.jsx("button",{type:"button",className:"btn btn-secondary",onClick:t,disabled:l,children:m}),e.jsx("button",{type:"button",className:`btn btn-${d}`,onClick:C,disabled:p||l,"aria-busy":l,children:l?e.jsxs("span",{className:"ds-modal__loading",children:[e.jsx("span",{className:"ds-modal__spinner","aria-hidden":"true"}),s]}):s})]})]})}o.__docgenInfo={description:"Modal component — accessible, themeable modal dialog.",methods:[{name:"Actions",docblock:null,modifiers:["static"],params:[{name:"{ children, align = 'right', className = '' }",optional:!1,type:null}],returns:null}],displayName:"Modal",props:{size:{defaultValue:{value:"'md'",computed:!1},required:!1},closeOnOverlayClick:{defaultValue:{value:"true",computed:!1},required:!1},closeOnEscape:{defaultValue:{value:"true",computed:!1},required:!1},showCloseButton:{defaultValue:{value:"true",computed:!1},required:!1},className:{defaultValue:{value:"''",computed:!1},required:!1}}};U.__docgenInfo={description:`ConfirmDialog — simplified modal for confirmations with async support.

Usage:
  <ConfirmDialog
    isOpen={isOpen}
    onClose={() => setIsOpen(false)}
    onConfirm={handleConfirm}
    title="Delete Campaign?"
    message="This action cannot be undone."
    confirmLabel="Delete"
    variant="danger"
    loading={isDeleting}
  />`,methods:[],displayName:"ConfirmDialog",props:{confirmLabel:{defaultValue:{value:"'Confirm'",computed:!1},required:!1},cancelLabel:{defaultValue:{value:"'Cancel'",computed:!1},required:!1},variant:{defaultValue:{value:"'primary'",computed:!1},required:!1},loading:{defaultValue:{value:"false",computed:!1},required:!1},disabled:{defaultValue:{value:"false",computed:!1},required:!1}}};const se={title:"Design System/Modal",component:o,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:"Accessible modal dialog following the WAI-ARIA Dialog pattern: focus trap, ESC/overlay close, keyboard navigation, and screen-reader support. Themed through CSS custom properties."}}},argTypes:{size:{control:"inline-radio",options:["sm","md","lg","full"]},closeOnOverlayClick:{control:"boolean"},closeOnEscape:{control:"boolean"},showCloseButton:{control:"boolean"},onClose:{action:"closed"}}},b={args:{isOpen:!0,title:"Modal Title",children:e.jsxs("div",{children:[e.jsx("p",{style:{margin:"0 0 1rem",color:"var(--text-muted)"},children:"This is a modal dialog with focus trapping, ESC/overlay close, and keyboard navigation."}),e.jsxs(o.Actions,{children:[e.jsx("button",{type:"button",className:"btn btn-secondary",children:"Cancel"}),e.jsx("button",{type:"button",className:"btn btn-primary",children:"Confirm"})]})]})}},f={args:{isOpen:!0,size:"sm",title:"Confirm Action",children:e.jsxs("div",{children:[e.jsx("p",{style:{margin:"0 0 1rem",color:"var(--text-muted)"},children:"This is a small modal for confirmations."}),e.jsxs(o.Actions,{children:[e.jsx("button",{type:"button",className:"btn btn-secondary",children:"Cancel"}),e.jsx("button",{type:"button",className:"btn btn-primary",children:"Confirm"})]})]})}},h={args:{isOpen:!0,size:"lg",title:"Campaign Details",children:e.jsxs("div",{children:[e.jsx("p",{style:{margin:"0 0 1rem",color:"var(--text-muted)"},children:"This is a large modal for complex content with more information."}),e.jsxs("div",{style:{background:"var(--bg-elevated)",padding:"1rem",borderRadius:"8px",marginBottom:"1rem"},children:[e.jsx("h4",{style:{margin:"0 0 0.5rem"},children:"Campaign Info"}),e.jsxs("p",{style:{margin:0,fontSize:"0.875rem",color:"var(--text-muted)"},children:["Reward: 25 points per action",e.jsx("br",{}),"Duration: June 1 - Aug 31, 2026",e.jsx("br",{}),"Category: DeFi"]})]}),e.jsxs(o.Actions,{children:[e.jsx("button",{type:"button",className:"btn btn-secondary",children:"Close"}),e.jsx("button",{type:"button",className:"btn btn-primary",children:"Edit Campaign"})]})]})}},g={args:{isOpen:!0,size:"sm",title:"Delete Campaign?",children:e.jsxs("div",{children:[e.jsx("p",{style:{margin:"0 0 1rem",color:"var(--text-muted)"},children:"This action cannot be undone. All campaign data including claims and rewards will be permanently removed."}),e.jsxs(o.Actions,{children:[e.jsx("button",{type:"button",className:"btn btn-secondary",children:"Cancel"}),e.jsx("button",{type:"button",className:"btn btn-danger",children:"Delete Campaign"})]})]})}};function Y(){const[n,t]=r.useState(!1),[a,i]=r.useState(!1),c=async()=>{i(!0),await new Promise(s=>setTimeout(s,2e3)),i(!1),t(!1)};return e.jsxs("div",{children:[e.jsx("button",{type:"button",className:"btn btn-danger",onClick:()=>t(!0),children:"Delete Campaign"}),e.jsx(U,{isOpen:n,onClose:()=>!a&&t(!1),onConfirm:c,title:"Delete Campaign?",message:"This action cannot be undone. The campaign and all associated data will be permanently removed.",confirmLabel:"Delete",variant:"danger",loading:a})]})}const y={render:()=>e.jsx(Y,{}),parameters:{docs:{description:{story:"Modal with async confirm state showing a loading indicator while the action is in progress."}}}};function Z(){const[n,t]=r.useState(!1);return e.jsxs("div",{children:[e.jsx("button",{type:"button",className:"btn btn-primary",onClick:()=>t(!0),children:"Open Modal"}),e.jsxs(o,{isOpen:n,onClose:()=>t(!1),title:"Interactive Modal",children:[e.jsx("p",{style:{margin:"0 0 1rem",color:"var(--text-muted)"},children:"Try pressing Escape, clicking the overlay, or tabbing through the focusable elements."}),e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"0.75rem",marginBottom:"1rem"},children:[e.jsx("input",{type:"text",placeholder:"First focusable element",className:"ds-field__input"}),e.jsx("input",{type:"text",placeholder:"Second focusable element",className:"ds-field__input"})]}),e.jsxs(o.Actions,{children:[e.jsx("button",{type:"button",className:"btn btn-secondary",onClick:()=>t(!1),children:"Cancel"}),e.jsx("button",{type:"button",className:"btn btn-primary",onClick:()=>t(!1),children:"Confirm"})]})]})]})}const v={render:()=>e.jsx(Z,{}),parameters:{docs:{description:{story:"Interactive modal demonstrating focus trap, ESC close, and overlay click close."}}}},x={args:{isOpen:!0,title:"Light Theme Modal",children:e.jsxs("div",{children:[e.jsx("p",{style:{margin:"0 0 1rem",color:"var(--text-muted)"},children:"Modal automatically adapts to the light theme through CSS custom properties."}),e.jsxs(o.Actions,{children:[e.jsx("button",{type:"button",className:"btn btn-secondary",children:"Cancel"}),e.jsx("button",{type:"button",className:"btn btn-primary",children:"Confirm"})]})]})},globals:{theme:"light"}};var D,_,k;b.parameters={...b.parameters,docs:{...(D=b.parameters)==null?void 0:D.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    title: 'Modal Title',
    children: <div>
        <p style={{
        margin: '0 0 1rem',
        color: 'var(--text-muted)'
      }}>
          This is a modal dialog with focus trapping, ESC/overlay close, and keyboard navigation.
        </p>
        <Modal.Actions>
          <button type="button" className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" className="btn btn-primary">
            Confirm
          </button>
        </Modal.Actions>
      </div>
  }
}`,...(k=(_=b.parameters)==null?void 0:_.docs)==null?void 0:k.source}}};var M,S,E;f.parameters={...f.parameters,docs:{...(M=f.parameters)==null?void 0:M.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    size: 'sm',
    title: 'Confirm Action',
    children: <div>
        <p style={{
        margin: '0 0 1rem',
        color: 'var(--text-muted)'
      }}>
          This is a small modal for confirmations.
        </p>
        <Modal.Actions>
          <button type="button" className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" className="btn btn-primary">
            Confirm
          </button>
        </Modal.Actions>
      </div>
  }
}`,...(E=(S=f.parameters)==null?void 0:S.docs)==null?void 0:E.source}}};var T,I,O;h.parameters={...h.parameters,docs:{...(T=h.parameters)==null?void 0:T.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    size: 'lg',
    title: 'Campaign Details',
    children: <div>
        <p style={{
        margin: '0 0 1rem',
        color: 'var(--text-muted)'
      }}>
          This is a large modal for complex content with more information.
        </p>
        <div style={{
        background: 'var(--bg-elevated)',
        padding: '1rem',
        borderRadius: '8px',
        marginBottom: '1rem'
      }}>
          <h4 style={{
          margin: '0 0 0.5rem'
        }}>Campaign Info</h4>
          <p style={{
          margin: 0,
          fontSize: '0.875rem',
          color: 'var(--text-muted)'
        }}>
            Reward: 25 points per action<br />
            Duration: June 1 - Aug 31, 2026<br />
            Category: DeFi
          </p>
        </div>
        <Modal.Actions>
          <button type="button" className="btn btn-secondary">
            Close
          </button>
          <button type="button" className="btn btn-primary">
            Edit Campaign
          </button>
        </Modal.Actions>
      </div>
  }
}`,...(O=(I=h.parameters)==null?void 0:I.docs)==null?void 0:O.source}}};var L,q,z;g.parameters={...g.parameters,docs:{...(L=g.parameters)==null?void 0:L.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    size: 'sm',
    title: 'Delete Campaign?',
    children: <div>
        <p style={{
        margin: '0 0 1rem',
        color: 'var(--text-muted)'
      }}>
          This action cannot be undone. All campaign data including claims and rewards will be permanently removed.
        </p>
        <Modal.Actions>
          <button type="button" className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" className="btn btn-danger">
            Delete Campaign
          </button>
        </Modal.Actions>
      </div>
  }
}`,...(z=(q=g.parameters)==null?void 0:q.docs)==null?void 0:z.source}}};var R,V,B;y.parameters={...y.parameters,docs:{...(R=y.parameters)==null?void 0:R.docs,source:{originalSource:`{
  render: () => <AsyncConfirmDemo />,
  parameters: {
    docs: {
      description: {
        story: 'Modal with async confirm state showing a loading indicator while the action is in progress.'
      }
    }
  }
}`,...(B=(V=y.parameters)==null?void 0:V.docs)==null?void 0:B.source}}};var F,$,K;v.parameters={...v.parameters,docs:{...(F=v.parameters)==null?void 0:F.docs,source:{originalSource:`{
  render: () => <InteractiveDemo />,
  parameters: {
    docs: {
      description: {
        story: 'Interactive modal demonstrating focus trap, ESC close, and overlay click close.'
      }
    }
  }
}`,...(K=($=v.parameters)==null?void 0:$.docs)==null?void 0:K.source}}};var P,J,W;x.parameters={...x.parameters,docs:{...(P=x.parameters)==null?void 0:P.docs,source:{originalSource:`{
  args: {
    isOpen: true,
    title: 'Light Theme Modal',
    children: <div>
        <p style={{
        margin: '0 0 1rem',
        color: 'var(--text-muted)'
      }}>
          Modal automatically adapts to the light theme through CSS custom properties.
        </p>
        <Modal.Actions>
          <button type="button" className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" className="btn btn-primary">
            Confirm
          </button>
        </Modal.Actions>
      </div>
  },
  globals: {
    theme: 'light'
  }
}`,...(W=(J=x.parameters)==null?void 0:J.docs)==null?void 0:W.source}}};const oe=["Default","Small","Large","DangerConfirm","AsyncConfirm","Interactive","LightTheme"];export{y as AsyncConfirm,g as DangerConfirm,b as Default,v as Interactive,h as Large,x as LightTheme,f as Small,oe as __namedExportsOrder,se as default};
