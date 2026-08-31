import{j as i}from"./jsx-runtime-Z5uAzocK.js";import{r as t}from"./index-pP6CS22B.js";/* empty css               */import"./_commonjsHelpers-Cpj98o6Y.js";const he={prev:"ArrowLeft",next:"ArrowRight"},ve={prev:"ArrowUp",next:"ArrowDown"};function h(a,l,p){const n=a.length;if(n===0)return-1;for(let o=1;o<=n;o+=1){const c=(l+p*o+n*n)%n;if(!a[c].disabled)return c}return l}function N(a){const l=a.findIndex(p=>!p.disabled);return l===-1?0:l}function oe({items:a=[],value:l,defaultValue:p,onChange:n,orientation:o="horizontal",activation:c="automatic",variant:ie="underline",size:ce="md",className:de="",label:ue="Tabs",...pe}){const C=t.useId(),A=t.useRef([]),y=l!==void 0,[me,be]=t.useState(()=>{var e;return p??((e=a[N(a)])==null?void 0:e.id)}),k=y?l:me,d=t.useMemo(()=>{const e=a.findIndex(s=>s.id===k);return e===-1?N(a):e},[a,k]),[m,_]=t.useState(d);t.useEffect(()=>{_(d)},[d]);const b=t.useCallback(e=>{const s=a[e];!s||s.disabled||(y||be(s.id),n==null||n(s.id,e))},[a,y,n]),g=t.useCallback(e=>{var s;_(e),(s=A.current[e])==null||s.focus(),c==="automatic"&&b(e)},[c,b]),ge=t.useCallback(e=>{const s=o==="vertical"?ve:he;switch(e.key){case s.prev:e.preventDefault(),g(h(a,m,-1));break;case s.next:e.preventDefault(),g(h(a,m,1));break;case"Home":e.preventDefault(),g(h(a,a.length-1,1));break;case"End":e.preventDefault(),g(h(a,0,-1));break;case"Enter":case" ":c==="manual"&&(e.preventDefault(),b(m));break}},[c,m,a,g,o,b]);if(a.length===0)return null;const M=e=>`${C}-tab-${a[e].id}`,D=e=>`${C}-panel-${a[e].id}`,V=a[d];return i.jsxs("div",{className:["ds-tabs",`ds-tabs--${o}`,`ds-tabs--${ie}`,de].filter(Boolean).join(" "),"data-size":ce,...pe,children:[i.jsx("div",{role:"tablist","aria-label":ue,"aria-orientation":o,className:"ds-tabs__list",onKeyDown:ge,children:a.map((e,s)=>{const j=s===d;return i.jsxs("button",{type:"button",role:"tab",id:M(s),ref:fe=>{A.current[s]=fe},className:`ds-tabs__tab${j?" is-selected":""}`,"aria-selected":j,"aria-controls":D(s),"aria-disabled":e.disabled?!0:void 0,disabled:e.disabled,tabIndex:s===m?0:-1,onClick:()=>{_(s),b(s)},children:[e.icon?i.jsx("span",{className:"ds-tabs__icon","aria-hidden":"true",children:e.icon}):null,i.jsx("span",{className:"ds-tabs__label",children:e.label}),e.badge!==void 0&&e.badge!==null?i.jsx("span",{className:"ds-tabs__badge",children:e.badge}):null]},e.id)})}),V?i.jsx("div",{role:"tabpanel",id:D(d),"aria-labelledby":M(d),className:"ds-tabs__panel",tabIndex:0,children:V.content}):null]})}oe.__docgenInfo={description:"",methods:[],displayName:"Tabs",props:{items:{defaultValue:{value:"[]",computed:!1},required:!1},orientation:{defaultValue:{value:"'horizontal'",computed:!1},required:!1},activation:{defaultValue:{value:"'automatic'",computed:!1},required:!1},variant:{defaultValue:{value:"'underline'",computed:!1},required:!1},size:{defaultValue:{value:"'md'",computed:!1},required:!1},className:{defaultValue:{value:"''",computed:!1},required:!1},label:{defaultValue:{value:"'Tabs'",computed:!1},required:!1}}};const we={title:"Design System/Tabs",component:oe,tags:["autodocs"],parameters:{layout:"padded",docs:{description:{component:"Accessible tab strip following the WAI-ARIA Tabs pattern: roving tabindex, arrow-key navigation with wrapping, Home/End, skipped disabled tabs, and automatic or manual activation. Themed entirely through CSS custom properties."}}},argTypes:{orientation:{control:"inline-radio",options:["horizontal","vertical"]},activation:{control:"inline-radio",options:["automatic","manual"]},variant:{control:"inline-radio",options:["underline","pill"]},size:{control:"inline-radio",options:["sm","md"]},onChange:{action:"changed"}}},u=a=>i.jsx("p",{style:{margin:0,lineHeight:1.7},children:a}),r=[{id:"overview",label:"Overview",content:u("Campaign summary, budget and schedule.")},{id:"rewards",label:"Rewards",content:u("Reward tiers, vesting and claim windows.")},{id:"audit",label:"Audit",content:u("Every state change with its ledger and tx hash.")}],v={args:{items:r,label:"Campaign sections"}},I={args:{items:r,variant:"pill",label:"Campaign sections"}},S={args:{items:r,orientation:"vertical",label:"Campaign sections"}},T={args:{label:"Operations",items:[{id:"queue",label:"Queue",icon:"⚙️",badge:12,content:u("Pending payouts.")},{id:"alerts",label:"Alerts",icon:"🔔",badge:3,content:u("Open alerts.")},{id:"done",label:"Settled",icon:"✅",content:u("Settled batches.")}]}},E={args:{label:"Campaign sections",items:[r[0],{...r[1],disabled:!0},r[2]]}},f={args:{items:r,activation:"manual",label:"Campaign sections"}},w={args:{items:r,variant:"pill",size:"sm",label:"Campaign sections"}},x={args:{items:r,label:"Campaign sections"},globals:{theme:"light"}};var q,R,z;v.parameters={...v.parameters,docs:{...(q=v.parameters)==null?void 0:q.docs,source:{originalSource:`{
  args: {
    items: ITEMS,
    label: 'Campaign sections'
  }
}`,...(z=(R=v.parameters)==null?void 0:R.docs)==null?void 0:z.source}}};var O,$,P;I.parameters={...I.parameters,docs:{...(O=I.parameters)==null?void 0:O.docs,source:{originalSource:`{
  args: {
    items: ITEMS,
    variant: 'pill',
    label: 'Campaign sections'
  }
}`,...(P=($=I.parameters)==null?void 0:$.docs)==null?void 0:P.source}}};var L,W,H;S.parameters={...S.parameters,docs:{...(L=S.parameters)==null?void 0:L.docs,source:{originalSource:`{
  args: {
    items: ITEMS,
    orientation: 'vertical',
    label: 'Campaign sections'
  }
}`,...(H=(W=S.parameters)==null?void 0:W.docs)==null?void 0:H.source}}};var K,B,F;T.parameters={...T.parameters,docs:{...(K=T.parameters)==null?void 0:K.docs,source:{originalSource:`{
  args: {
    label: 'Operations',
    items: [{
      id: 'queue',
      label: 'Queue',
      icon: '⚙️',
      badge: 12,
      content: panel('Pending payouts.')
    }, {
      id: 'alerts',
      label: 'Alerts',
      icon: '🔔',
      badge: 3,
      content: panel('Open alerts.')
    }, {
      id: 'done',
      label: 'Settled',
      icon: '✅',
      content: panel('Settled batches.')
    }]
  }
}`,...(F=(B=T.parameters)==null?void 0:B.docs)==null?void 0:F.source}}};var Q,Y,U;E.parameters={...E.parameters,docs:{...(Q=E.parameters)==null?void 0:Q.docs,source:{originalSource:`{
  args: {
    label: 'Campaign sections',
    items: [ITEMS[0], {
      ...ITEMS[1],
      disabled: true
    }, ITEMS[2]]
  }
}`,...(U=(Y=E.parameters)==null?void 0:Y.docs)==null?void 0:U.source}}};var Z,G,J,X,ee;f.parameters={...f.parameters,docs:{...(Z=f.parameters)==null?void 0:Z.docs,source:{originalSource:`{
  args: {
    items: ITEMS,
    activation: 'manual',
    label: 'Campaign sections'
  }
}`,...(J=(G=f.parameters)==null?void 0:G.docs)==null?void 0:J.source},description:{story:"Manual activation: arrow keys move focus, Enter/Space commits the change.",...(ee=(X=f.parameters)==null?void 0:X.docs)==null?void 0:ee.description}}};var ae,se,ne;w.parameters={...w.parameters,docs:{...(ae=w.parameters)==null?void 0:ae.docs,source:{originalSource:`{
  args: {
    items: ITEMS,
    variant: 'pill',
    size: 'sm',
    label: 'Campaign sections'
  }
}`,...(ne=(se=w.parameters)==null?void 0:se.docs)==null?void 0:ne.source}}};var te,re,le;x.parameters={...x.parameters,docs:{...(te=x.parameters)==null?void 0:te.docs,source:{originalSource:`{
  args: {
    items: ITEMS,
    label: 'Campaign sections'
  },
  globals: {
    theme: 'light'
  }
}`,...(le=(re=x.parameters)==null?void 0:re.docs)==null?void 0:le.source}}};const xe=["Default","Pills","Vertical","WithIconsAndBadges","WithDisabledTab","ManualActivation","SmallPills","LightTheme"];export{v as Default,x as LightTheme,f as ManualActivation,I as Pills,w as SmallPills,S as Vertical,E as WithDisabledTab,T as WithIconsAndBadges,xe as __namedExportsOrder,we as default};
