import{j as e}from"./jsx-runtime-Z5uAzocK.js";import"./index-pP6CS22B.js";import"./_commonjsHelpers-Cpj98o6Y.js";function f({eyebrow:C="Nothing here yet",title:w,description:k,actionLabel:s="",onAction:n}){return e.jsxs("div",{className:"empty-state",role:"status","aria-live":"polite",children:[e.jsx("p",{className:"empty-state-eyebrow",children:C}),e.jsx("h3",{className:"empty-state-title",children:w}),e.jsx("p",{className:"empty-state-copy",children:k}),s&&n&&e.jsx("button",{type:"button",className:"btn btn-secondary btn-button empty-state-action",onClick:n,children:s})]})}f.__docgenInfo={description:"",methods:[],displayName:"EmptyState",props:{eyebrow:{defaultValue:{value:"'Nothing here yet'",computed:!1},required:!1},actionLabel:{defaultValue:{value:"''",computed:!1},required:!1}}};const x={title:"Components/EmptyState",component:f,tags:["autodocs"],argTypes:{onAction:{action:"actionClicked"}}},t={args:{eyebrow:"No campaigns yet",title:"Nothing here yet",description:"Create your first campaign to start rewarding your community.",actionLabel:"Create campaign",onAction:()=>{}}},a={args:{eyebrow:"No results",title:"No campaigns match your search",description:"Try adjusting your filters or search terms.",actionLabel:"Clear filters",onAction:()=>{}}},r={args:{eyebrow:"All done",title:"Nothing to show",description:"Check back later.",actionLabel:""}},o={args:{eyebrow:"No campaigns",title:"Nothing here yet",description:"Get started by creating a campaign.",actionLabel:"Create campaign",onAction:()=>{}},parameters:{backgrounds:{default:"dark"}}};var i,c,p;t.parameters={...t.parameters,docs:{...(i=t.parameters)==null?void 0:i.docs,source:{originalSource:`{
  args: {
    eyebrow: 'No campaigns yet',
    title: 'Nothing here yet',
    description: 'Create your first campaign to start rewarding your community.',
    actionLabel: 'Create campaign',
    onAction: () => {}
  }
}`,...(p=(c=t.parameters)==null?void 0:c.docs)==null?void 0:p.source}}};var m,l,d;a.parameters={...a.parameters,docs:{...(m=a.parameters)==null?void 0:m.docs,source:{originalSource:`{
  args: {
    eyebrow: 'No results',
    title: 'No campaigns match your search',
    description: 'Try adjusting your filters or search terms.',
    actionLabel: 'Clear filters',
    onAction: () => {}
  }
}`,...(d=(l=a.parameters)==null?void 0:l.docs)==null?void 0:d.source}}};var u,g,y;r.parameters={...r.parameters,docs:{...(u=r.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    eyebrow: 'All done',
    title: 'Nothing to show',
    description: 'Check back later.',
    actionLabel: ''
  }
}`,...(y=(g=r.parameters)==null?void 0:g.docs)==null?void 0:y.source}}};var h,b,N;o.parameters={...o.parameters,docs:{...(h=o.parameters)==null?void 0:h.docs,source:{originalSource:`{
  args: {
    eyebrow: 'No campaigns',
    title: 'Nothing here yet',
    description: 'Get started by creating a campaign.',
    actionLabel: 'Create campaign',
    onAction: () => {}
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  }
}`,...(N=(b=o.parameters)==null?void 0:b.docs)==null?void 0:N.source}}};const L=["NoCampaigns","SearchNoResults","WithoutAction","DarkMode"];export{o as DarkMode,t as NoCampaigns,a as SearchNoResults,r as WithoutAction,L as __namedExportsOrder,x as default};
