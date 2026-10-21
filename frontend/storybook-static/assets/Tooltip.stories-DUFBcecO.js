import{j as t}from"./jsx-runtime-Z5uAzocK.js";import{r as n}from"./index-pP6CS22B.js";/* empty css               */import"./_commonjsHelpers-Cpj98o6Y.js";function fe(e){const s=n.useRef(null),r=n.useCallback(()=>{s.current!==null&&(clearTimeout(s.current),s.current=null)},[]),v=n.useCallback((p,d)=>{if(r(),!d){e(p);return}s.current=setTimeout(()=>{s.current=null,e(p)},d)},[r,e]);return n.useEffect(()=>r,[r]),{schedule:v,clear:r}}function j(e,s){return r=>{e==null||e(r),s(r)}}function w({children:e,content:s,placement:r="top",openDelay:v=120,closeDelay:p=80,disabled:d=!1,defaultOpen:g=!1,className:L="",id:D}){const q=n.useId(),E=D??`${q}-tooltip`,[i,u]=n.useState(g),{schedule:f,clear:h}=fe(u),O=()=>!d&&f(!0,v),o=()=>f(!1,p);if(n.useEffect(()=>{if(!i)return;const y=b=>{b.key==="Escape"&&(h(),u(!1))};return document.addEventListener("keydown",y),()=>document.removeEventListener("keydown",y)},[i,h]),!s||d)return e;const k=n.cloneElement(e,{"aria-describedby":i?[e.props["aria-describedby"],E].filter(Boolean).join(" "):e.props["aria-describedby"],onMouseEnter:j(e.props.onMouseEnter,O),onMouseLeave:j(e.props.onMouseLeave,o),onFocus:j(e.props.onFocus,()=>!d&&u(!0)),onBlur:j(e.props.onBlur,()=>{h(),u(!1)})});return t.jsxs("span",{className:["ds-overlay-root",L].filter(Boolean).join(" "),onMouseEnter:h,onMouseLeave:o,children:[k,t.jsxs("span",{role:"tooltip",id:E,className:`ds-tooltip ds-overlay--${r}`,"data-state":i?"open":"closed",hidden:!i,children:[s,t.jsx("span",{className:"ds-overlay__arrow","aria-hidden":"true"})]})]})}function $({children:e,content:s,title:r,placement:v="bottom",open:p,defaultOpen:d=!1,onOpenChange:g,closeOnOutsideClick:L=!0,className:D="",id:q}){const E=n.useId(),i=q??`${E}-popover`,u=`${i}-title`,f=p!==void 0,[h,O]=n.useState(d),o=f?p:h,k=n.useRef(null),y=n.useRef(null),b=n.useRef(null),M=n.useRef(o),B=n.useCallback(a=>{f||O(a),g==null||g(a)},[f,g]);n.useEffect(()=>{if(!o)return;const a=c=>{var l,F;c.key==="Escape"&&(c.stopPropagation(),B(!1),(F=(l=b.current)==null?void 0:l.focus)==null||F.call(l))},T=c=>{var l;L&&((l=k.current)!=null&&l.contains(c.target)||B(!1))};return document.addEventListener("keydown",a),document.addEventListener("mousedown",T),()=>{document.removeEventListener("keydown",a),document.removeEventListener("mousedown",T)}},[o,L,B]),n.useEffect(()=>{var a,T,c,l;o&&!M.current?(T=(a=y.current)==null?void 0:a.focus)==null||T.call(a):!o&&M.current&&((l=(c=b.current)==null?void 0:c.focus)==null||l.call(c)),M.current=o},[o]);const ge=n.cloneElement(e,{ref:b,"aria-expanded":o,"aria-haspopup":"dialog","aria-controls":o?i:void 0,onClick:j(e.props.onClick,()=>B(!o))});return t.jsxs("span",{ref:k,className:["ds-overlay-root",D].filter(Boolean).join(" "),children:[ge,t.jsxs("div",{ref:y,role:"dialog",id:i,"aria-labelledby":r?u:void 0,"aria-label":r?void 0:"More information",className:`ds-popover ds-overlay--${v}`,"data-state":o?"open":"closed",hidden:!o,tabIndex:-1,children:[r?t.jsx("h2",{id:u,className:"ds-popover__title",children:r}):null,t.jsx("div",{className:"ds-popover__body",children:s}),t.jsx("span",{className:"ds-overlay__arrow","aria-hidden":"true"})]})]})}w.__docgenInfo={description:"",methods:[],displayName:"Tooltip",props:{placement:{defaultValue:{value:"'top'",computed:!1},required:!1},openDelay:{defaultValue:{value:"120",computed:!1},required:!1},closeDelay:{defaultValue:{value:"80",computed:!1},required:!1},disabled:{defaultValue:{value:"false",computed:!1},required:!1},defaultOpen:{defaultValue:{value:"false",computed:!1},required:!1},className:{defaultValue:{value:"''",computed:!1},required:!1}}};$.__docgenInfo={description:"",methods:[],displayName:"Popover",props:{placement:{defaultValue:{value:"'bottom'",computed:!1},required:!1},defaultOpen:{defaultValue:{value:"false",computed:!1},required:!1},closeOnOutsideClick:{defaultValue:{value:"true",computed:!1},required:!1},className:{defaultValue:{value:"''",computed:!1},required:!1}}};const Te={title:"Design System/Tooltip",component:w,tags:["autodocs"],parameters:{layout:"centered",docs:{description:{component:'Tooltip is a passive description for inline glossary terms (TTL, vesting): it opens on hover *and* focus, stays open while the pointer is over the bubble, and is dismissable with Escape. Popover is the interactive sibling — role="dialog", focus moves in on open and returns to the trigger on close.'}}},argTypes:{placement:{control:"inline-radio",options:["top","bottom","left","right"]},openDelay:{control:{type:"number",min:0,max:1e3,step:20}},closeDelay:{control:{type:"number",min:0,max:1e3,step:20}}}},m=e=>t.jsx("button",{type:"button",className:"btn btn-secondary",...e,children:e.children}),P={args:{content:"Time-to-live — how long the campaign ledger entry survives before it must be bumped.",children:t.jsx(m,{children:"TTL"})}},x={render:()=>t.jsx("div",{style:{display:"grid",gap:"5rem",placeItems:"center",padding:"5rem"},children:t.jsx("div",{style:{display:"flex",gap:"4rem"},children:["top","bottom","left","right"].map(e=>t.jsx(w,{content:`Placed ${e}`,placement:e,defaultOpen:!0,children:t.jsx(m,{children:e})},e))})})},R={args:{content:"Vesting releases a reward gradually instead of all at once. Unclaimed portions stay in the campaign escrow until their unlock ledger passes, so a participant can leave and still claim what has already vested.",children:t.jsx(m,{children:"Vesting"})}},W={background:"none",border:"none",padding:0,font:"inherit",color:"inherit",textDecoration:"underline dotted",textUnderlineOffset:"3px",cursor:"help"},S={render:()=>t.jsxs("p",{style:{maxWidth:"32rem",lineHeight:1.8},children:["Rewards are streamed against the campaign's"," ",t.jsx(w,{content:"The escrowed balance the campaign can still pay out.",children:t.jsx("button",{type:"button",style:W,children:"remaining budget"})})," ","and expire once the"," ",t.jsx(w,{content:"Time-to-live for the ledger entry backing this campaign.",children:t.jsx("button",{type:"button",style:W,children:"TTL"})})," ","lapses."]})},V={args:{content:"You will never see this.",disabled:!0,children:t.jsx(m,{children:"No tooltip"})}},I={render:()=>t.jsx($,{title:"Vesting",content:t.jsxs(t.Fragment,{children:[t.jsx("p",{style:{marginTop:0},children:"Rewards unlock on a schedule instead of all at once."}),t.jsx("a",{href:"https://github.com/FinesseStudioLab/Trivela",children:"Read the vesting guide"})]}),children:t.jsx(m,{children:"What is vesting?"})})},N={render:()=>t.jsx("div",{style:{display:"flex",gap:"4rem",padding:"8rem 4rem"},children:["top","bottom","left","right"].map(e=>t.jsx($,{title:e,content:t.jsxs("p",{style:{margin:0},children:["Panel anchored ",e,"."]}),placement:e,children:t.jsx(m,{children:e})},e))})},_={args:{content:"Time-to-live for the campaign ledger entry.",children:t.jsx(m,{children:"TTL"}),defaultOpen:!0},globals:{theme:"light"}};var C,U,A;P.parameters={...P.parameters,docs:{...(C=P.parameters)==null?void 0:C.docs,source:{originalSource:`{
  args: {
    content: 'Time-to-live — how long the campaign ledger entry survives before it must be bumped.',
    children: <TriggerButton>TTL</TriggerButton>
  }
}`,...(A=(U=P.parameters)==null?void 0:U.docs)==null?void 0:A.source}}};var H,K,Y,z,G;x.parameters={...x.parameters,docs:{...(H=x.parameters)==null?void 0:H.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'grid',
    gap: '5rem',
    placeItems: 'center',
    padding: '5rem'
  }}>
      <div style={{
      display: 'flex',
      gap: '4rem'
    }}>
        {['top', 'bottom', 'left', 'right'].map(placement => <Tooltip key={placement} content={\`Placed \${placement}\`} placement={placement} defaultOpen>
            <TriggerButton>{placement}</TriggerButton>
          </Tooltip>)}
      </div>
    </div>
}`,...(Y=(K=x.parameters)==null?void 0:K.docs)==null?void 0:Y.source},description:{story:"Rendered open so the placement is visible in docs and visual snapshots.",...(G=(z=x.parameters)==null?void 0:z.docs)==null?void 0:G.description}}};var J,Q,X;R.parameters={...R.parameters,docs:{...(J=R.parameters)==null?void 0:J.docs,source:{originalSource:`{
  args: {
    content: 'Vesting releases a reward gradually instead of all at once. Unclaimed portions stay in ' + 'the campaign escrow until their unlock ledger passes, so a participant can leave and ' + 'still claim what has already vested.',
    children: <TriggerButton>Vesting</TriggerButton>
  }
}`,...(X=(Q=R.parameters)==null?void 0:Q.docs)==null?void 0:X.source}}};var Z,ee,te;S.parameters={...S.parameters,docs:{...(Z=S.parameters)==null?void 0:Z.docs,source:{originalSource:`{
  render: () => <p style={{
    maxWidth: '32rem',
    lineHeight: 1.8
  }}>
      Rewards are streamed against the campaign&apos;s{' '}
      <Tooltip content="The escrowed balance the campaign can still pay out.">
        <button type="button" style={termStyle}>
          remaining budget
        </button>
      </Tooltip>{' '}
      and expire once the{' '}
      <Tooltip content="Time-to-live for the ledger entry backing this campaign.">
        <button type="button" style={termStyle}>
          TTL
        </button>
      </Tooltip>{' '}
      lapses.
    </p>
}`,...(te=(ee=S.parameters)==null?void 0:ee.docs)==null?void 0:te.source}}};var ne,re,oe;V.parameters={...V.parameters,docs:{...(ne=V.parameters)==null?void 0:ne.docs,source:{originalSource:`{
  args: {
    content: 'You will never see this.',
    disabled: true,
    children: <TriggerButton>No tooltip</TriggerButton>
  }
}`,...(oe=(re=V.parameters)==null?void 0:re.docs)==null?void 0:oe.source}}};var se,ae,le;I.parameters={...I.parameters,docs:{...(se=I.parameters)==null?void 0:se.docs,source:{originalSource:`{
  render: () => <Popover title="Vesting" content={<>
          <p style={{
      marginTop: 0
    }}>Rewards unlock on a schedule instead of all at once.</p>
          <a href="https://github.com/FinesseStudioLab/Trivela">Read the vesting guide</a>
        </>}>
      <TriggerButton>What is vesting?</TriggerButton>
    </Popover>
}`,...(le=(ae=I.parameters)==null?void 0:ae.docs)==null?void 0:le.source}}};var ie,ce,de;N.parameters={...N.parameters,docs:{...(ie=N.parameters)==null?void 0:ie.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    gap: '4rem',
    padding: '8rem 4rem'
  }}>
      {['top', 'bottom', 'left', 'right'].map(placement => <Popover key={placement} title={placement} content={<p style={{
      margin: 0
    }}>Panel anchored {placement}.</p>} placement={placement}>
          <TriggerButton>{placement}</TriggerButton>
        </Popover>)}
    </div>
}`,...(de=(ce=N.parameters)==null?void 0:ce.docs)==null?void 0:de.source}}};var pe,ue,me;_.parameters={..._.parameters,docs:{...(pe=_.parameters)==null?void 0:pe.docs,source:{originalSource:`{
  args: {
    content: 'Time-to-live for the campaign ledger entry.',
    children: <TriggerButton>TTL</TriggerButton>,
    defaultOpen: true
  },
  globals: {
    theme: 'light'
  }
}`,...(me=(ue=_.parameters)==null?void 0:ue.docs)==null?void 0:me.source}}};const xe=["Default","Placements","LongCopy","OnInlineTerm","Disabled","AsPopover","PopoverPlacements","LightTheme"];export{I as AsPopover,P as Default,V as Disabled,_ as LightTheme,R as LongCopy,S as OnInlineTerm,x as Placements,N as PopoverPlacements,xe as __namedExportsOrder,Te as default};
