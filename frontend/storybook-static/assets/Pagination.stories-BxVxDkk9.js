import{j as e}from"./jsx-runtime-Z5uAzocK.js";import{r as ge}from"./index-pP6CS22B.js";/* empty css               */import"./_commonjsHelpers-Cpj98o6Y.js";const Se=[10,25,50,100],z="ellipsis";function f(n,a){return Array.from({length:Math.max(0,a-n+1)},(t,s)=>n+s)}function be({page:n,pageCount:a,siblingCount:t=1,boundaryCount:s=1}){if(!Number.isFinite(a)||a<1)return[];const l=Math.min(Math.max(1,n),a),g=s*2+t*2+3;if(a<=g)return f(1,a);const i=f(1,s),M=f(a-s+1,a),m=Math.max(Math.min(l-t,a-s-t*2-1),s+2),p=Math.min(Math.max(l+t,s+t*2+2),a-s-1);return[...i,m>s+2?z:s+1,...f(m,p),p<a-s-1?z:a-s,...M]}function je({page:n,pageSize:a,totalItems:t}){if(!Number.isFinite(t)||!Number.isFinite(a)||a<=0)return"";if(t===0)return"No results";const s=(n-1)*a+1,l=Math.min(n*a,t);return`${s.toLocaleString()}–${l.toLocaleString()} of ${t.toLocaleString()}`}function I({page:n,pageCount:a,onPageChange:t,siblingCount:s=1,boundaryCount:l=1,showFirstLast:g=!1,disabled:i=!1,size:M="md",totalItems:m,pageSize:p,pageSizeOptions:me=Se,onPageSizeChange:y,label:he="Pagination",className:fe="",...xe}){const c=Math.max(1,Math.floor(a)||1),o=Math.min(Math.max(1,Math.floor(n)||1),c),_e=ge.useMemo(()=>be({page:o,pageCount:c,siblingCount:s,boundaryCount:l}),[o,c,s,l]),F=je({page:o,pageSize:p,totalItems:m}),E=o<=1,T=o>=c,u=r=>{const h=Math.min(Math.max(1,r),c);h===o||i||t==null||t(h)};return e.jsxs("nav",{className:["ds-pagination",fe].filter(Boolean).join(" "),"data-size":M,"aria-label":he,...xe,children:[F?e.jsx("p",{className:"ds-pagination__summary","aria-live":"polite",children:F}):null,e.jsxs("ol",{className:"ds-pagination__list",children:[g?e.jsx("li",{children:e.jsx("button",{type:"button",className:"ds-pagination__button ds-pagination__button--edge",onClick:()=>u(1),disabled:i||E,"aria-label":"Go to first page",children:e.jsx("span",{"aria-hidden":"true",children:"«"})})}):null,e.jsx("li",{children:e.jsx("button",{type:"button",className:"ds-pagination__button ds-pagination__button--edge",onClick:()=>u(o-1),disabled:i||E,"aria-label":"Go to previous page",children:e.jsx("span",{"aria-hidden":"true",children:"‹"})})}),_e.map((r,h)=>r===z?e.jsx("li",{className:"ds-pagination__gap","aria-hidden":"true",children:"…"},`gap-${h}`):e.jsx("li",{children:e.jsx("button",{type:"button",className:`ds-pagination__button${r===o?" is-current":""}`,onClick:()=>u(r),disabled:i,"aria-label":r===o?`Page ${r}, current page`:`Go to page ${r}`,"aria-current":r===o?"page":void 0,children:r})},r)),e.jsx("li",{children:e.jsx("button",{type:"button",className:"ds-pagination__button ds-pagination__button--edge",onClick:()=>u(o+1),disabled:i||T,"aria-label":"Go to next page",children:e.jsx("span",{"aria-hidden":"true",children:"›"})})}),g?e.jsx("li",{children:e.jsx("button",{type:"button",className:"ds-pagination__button ds-pagination__button--edge",onClick:()=>u(c),disabled:i||T,"aria-label":"Go to last page",children:e.jsx("span",{"aria-hidden":"true",children:"»"})})}):null]}),y?e.jsxs("label",{className:"ds-pagination__size",children:[e.jsx("span",{className:"ds-pagination__size-label",children:"Per page"}),e.jsx("select",{className:"ds-pagination__select",value:p,disabled:i,onChange:r=>y(Number(r.target.value)),children:me.map(r=>e.jsx("option",{value:r,children:r},r))})]}):null]})}I.__docgenInfo={description:"",methods:[],displayName:"Pagination",props:{siblingCount:{defaultValue:{value:"1",computed:!1},required:!1},boundaryCount:{defaultValue:{value:"1",computed:!1},required:!1},showFirstLast:{defaultValue:{value:"false",computed:!1},required:!1},disabled:{defaultValue:{value:"false",computed:!1},required:!1},size:{defaultValue:{value:"'md'",computed:!1},required:!1},pageSizeOptions:{defaultValue:{value:"[10, 25, 50, 100]",computed:!1},required:!1},label:{defaultValue:{value:"'Pagination'",computed:!1},required:!1},className:{defaultValue:{value:"''",computed:!1},required:!1}}};const ze={title:"Design System/Pagination",component:I,tags:["autodocs"],parameters:{layout:"padded",docs:{description:{component:"Presentational pagination control shared by every long list. Renders as a labelled <nav> around an ordered list, marks the active page with aria-current, gives every control an explicit label, and announces the visible range in a polite live region."}}},argTypes:{size:{control:"inline-radio",options:["sm","md"]},siblingCount:{control:{type:"number",min:0,max:3}},boundaryCount:{control:{type:"number",min:1,max:3}},onPageChange:{action:"pageChanged"}}},x={args:{page:1,pageCount:5}},_={args:{page:10,pageCount:20}},S={args:{page:2,pageCount:14,pageSize:25,totalItems:340}},b={args:{page:2,pageCount:14,pageSize:25,totalItems:340,onPageSizeChange:()=>{}}},j={args:{page:10,pageCount:20,showFirstLast:!0}},v={args:{page:3,pageCount:12,size:"sm"}},P={args:{page:3,pageCount:12,disabled:!0}},N={args:{page:1,pageCount:1}},k=25,q=340;function ve(n){const[a,t]=ge.useState(1);return e.jsx(I,{...n,page:a,pageCount:Math.ceil(q/k),pageSize:k,totalItems:q,onPageChange:t})}const d={render:n=>e.jsx(ve,{...n}),args:{showFirstLast:!0}},L={args:{page:10,pageCount:20,pageSize:25,totalItems:500},globals:{theme:"light"}};var V,A,G;x.parameters={...x.parameters,docs:{...(V=x.parameters)==null?void 0:V.docs,source:{originalSource:`{
  args: {
    page: 1,
    pageCount: 5
  }
}`,...(G=(A=x.parameters)==null?void 0:A.docs)==null?void 0:G.source}}};var W,$,w;_.parameters={..._.parameters,docs:{...(W=_.parameters)==null?void 0:W.docs,source:{originalSource:`{
  args: {
    page: 10,
    pageCount: 20
  }
}`,...(w=($=_.parameters)==null?void 0:$.docs)==null?void 0:w.source}}};var C,O,R;S.parameters={...S.parameters,docs:{...(C=S.parameters)==null?void 0:C.docs,source:{originalSource:`{
  args: {
    page: 2,
    pageCount: 14,
    pageSize: 25,
    totalItems: 340
  }
}`,...(R=(O=S.parameters)==null?void 0:O.docs)==null?void 0:R.source}}};var D,J,Z;b.parameters={...b.parameters,docs:{...(D=b.parameters)==null?void 0:D.docs,source:{originalSource:`{
  args: {
    page: 2,
    pageCount: 14,
    pageSize: 25,
    totalItems: 340,
    onPageSizeChange: () => {}
  }
}`,...(Z=(J=b.parameters)==null?void 0:J.docs)==null?void 0:Z.source}}};var B,U,H;j.parameters={...j.parameters,docs:{...(B=j.parameters)==null?void 0:B.docs,source:{originalSource:`{
  args: {
    page: 10,
    pageCount: 20,
    showFirstLast: true
  }
}`,...(H=(U=j.parameters)==null?void 0:U.docs)==null?void 0:H.source}}};var K,Q,X;v.parameters={...v.parameters,docs:{...(K=v.parameters)==null?void 0:K.docs,source:{originalSource:`{
  args: {
    page: 3,
    pageCount: 12,
    size: 'sm'
  }
}`,...(X=(Q=v.parameters)==null?void 0:Q.docs)==null?void 0:X.source}}};var Y,ee,ae;P.parameters={...P.parameters,docs:{...(Y=P.parameters)==null?void 0:Y.docs,source:{originalSource:`{
  args: {
    page: 3,
    pageCount: 12,
    disabled: true
  }
}`,...(ae=(ee=P.parameters)==null?void 0:ee.docs)==null?void 0:ae.source}}};var se,te,re;N.parameters={...N.parameters,docs:{...(se=N.parameters)==null?void 0:se.docs,source:{originalSource:`{
  args: {
    page: 1,
    pageCount: 1
  }
}`,...(re=(te=N.parameters)==null?void 0:te.docs)==null?void 0:re.source}}};var ne,oe,ie,le,ce;d.parameters={...d.parameters,docs:{...(ne=d.parameters)==null?void 0:ne.docs,source:{originalSource:`{
  render: args => <StatefulPagination {...args} />,
  args: {
    showFirstLast: true
  }
}`,...(ie=(oe=d.parameters)==null?void 0:oe.docs)==null?void 0:ie.source},description:{story:"Wired to local state so the control can actually be driven in the canvas.",...(ce=(le=d.parameters)==null?void 0:le.docs)==null?void 0:ce.description}}};var pe,ue,de;L.parameters={...L.parameters,docs:{...(pe=L.parameters)==null?void 0:pe.docs,source:{originalSource:`{
  args: {
    page: 10,
    pageCount: 20,
    pageSize: 25,
    totalItems: 500
  },
  globals: {
    theme: 'light'
  }
}`,...(de=(ue=L.parameters)==null?void 0:ue.docs)==null?void 0:de.source}}};const Ie=["Default","Truncated","WithResultSummary","WithPageSizePicker","WithFirstAndLastJumps","Small","Loading","SinglePage","Interactive","LightTheme"];export{x as Default,d as Interactive,L as LightTheme,P as Loading,N as SinglePage,v as Small,_ as Truncated,j as WithFirstAndLastJumps,b as WithPageSizePicker,S as WithResultSummary,Ie as __namedExportsOrder,ze as default};
