import{j as r}from"./jsx-runtime-Z5uAzocK.js";import{r as b}from"./index-pP6CS22B.js";import{S as H}from"./StatusBadge-CD60TgKe.js";import{L as J}from"./chunk-QUQL4437-KpW7D0B1.js";import"./_commonjsHelpers-Cpj98o6Y.js";function P(e,a=new Date){if(!e)return null;const n=new Date(e);if(Number.isNaN(n.getTime()))return null;const t=n.getTime()-a.getTime();if(t<0)return null;const s=Math.floor(t/(1e3*60*60)),i=Math.floor(t%(1e3*60*60)/(1e3*60));return{hours:s,minutes:i,totalMs:t}}function W(e,a){return e===0&&a===0?"Ending soon":e===0?`${a}m`:a===0?`${e}h`:`${e}h ${a}m`}function Y(e,a=new Date){const n=P(e,a);if(!n)return!1;const t=24*60*60*1e3;return n.totalMs<t}function X(e,a){return!a||a===0||e==null?!1:e/a>.85}function q(e,a){return!a||a===0||e==null?null:Math.min(Math.round(e/a*100),100)}function z(e,a=new Date){if(!e)return!1;const n=new Date(e);if(Number.isNaN(n.getTime()))return!1;const t=a.getTime()-n.getTime();if(t<0)return!1;const s=48*60*60*1e3;return t<s}const o={ENDING_SOON:"ending_soon",FILLING_FAST:"filling_fast",JUST_LAUNCHED:"just_launched"};function N(e,a=new Date){if(!e)return null;const{endDate:n,startDate:t,participantCount:s=0,maxParticipants:i=0}=e;if(Y(n,a)){const d=P(n,a);return{type:o.ENDING_SOON,data:{hours:d.hours,minutes:d.minutes,label:`Ends in ${W(d.hours,d.minutes)}`}}}if(X(s,i)){const d=q(s,i);return{type:o.FILLING_FAST,data:{percentage:d,label:`${d}% full`}}}return z(t,a)?{type:o.JUST_LAUNCHED,data:{label:"New"}}:null}function R({campaign:e}){const[a,n]=b.useState(()=>N(e));if(b.useEffect(()=>{const t=()=>{n(N(e))};t();const s=N(e);if((s==null?void 0:s.type)===o.ENDING_SOON){const i=setInterval(t,6e4);return()=>clearInterval(i)}},[e]),!a)return null;switch(a.type){case o.ENDING_SOON:return r.jsxs("span",{className:"urgency-badge urgency-badge--ending-soon",role:"status","aria-live":"polite",children:[r.jsx("span",{className:"urgency-badge-icon","aria-hidden":"true",children:"⏱"}),a.data.label]});case o.FILLING_FAST:return r.jsxs("span",{className:"urgency-badge urgency-badge--filling-fast",role:"status",children:[r.jsx("span",{className:"urgency-badge-icon","aria-hidden":"true",children:"🔥"}),a.data.label]});case o.JUST_LAUNCHED:return r.jsxs("span",{className:"urgency-badge urgency-badge--just-launched",role:"status",children:[r.jsx("span",{className:"urgency-badge-icon","aria-hidden":"true",children:"✨"}),a.data.label]});default:return null}}R.__docgenInfo={description:`UrgencyBadge component displays time-sensitive signals for campaigns
@param {object} props
@param {object} props.campaign - Campaign data`,methods:[],displayName:"UrgencyBadge"};function K(e){if(!e)return"";const a=new Date(e);return Number.isNaN(a.getTime())?"":new Intl.DateTimeFormat("en",{month:"short",day:"numeric",year:"numeric"}).format(a)}function $({campaign:e}){const a=b.useId(),n=K(e==null?void 0:e.createdAt),t=(e==null?void 0:e.rewardPerAction)??0,s=(e==null?void 0:e.description)||"No campaign description has been added yet.",i=(e==null?void 0:e.status)||(e!=null&&e.active?"active":"ended");return r.jsx("article",{className:"campaign-card","aria-labelledby":a,children:r.jsxs(J,{to:`/campaign/${e==null?void 0:e.id}`,className:"campaign-card-link",children:[r.jsxs("div",{className:"campaign-card-header",children:[r.jsxs("div",{children:[r.jsxs("p",{className:"campaign-card-eyebrow",children:["Campaign #",(e==null?void 0:e.id)||"—"]}),r.jsx("h3",{id:a,className:"campaign-card-title",children:(e==null?void 0:e.name)||"Untitled campaign"})]}),r.jsxs("div",{className:"campaign-card-badges",children:[r.jsx(R,{campaign:e}),r.jsx(H,{status:i})]})]}),r.jsx("p",{className:"campaign-card-description",children:s}),r.jsxs("dl",{className:"campaign-card-metadata",children:[r.jsxs("div",{className:"campaign-card-metadata-item",children:[r.jsx("dt",{children:"Reward"}),r.jsxs("dd",{children:[t," pts"]})]}),n&&r.jsxs("div",{className:"campaign-card-metadata-item",children:[r.jsx("dt",{children:"Created"}),r.jsx("dd",{children:n})]})]})]})})}$.__docgenInfo={description:"",methods:[],displayName:"CampaignCard"};const re={title:"Components/CampaignCard",component:$,tags:["autodocs"],argTypes:{campaign:{control:"object"},loading:{control:"boolean"}}},c={id:"1",name:"Summer DeFi Rewards",slug:"summer-defi-rewards",description:"Earn points for swapping on our DEX every day this summer.",active:!0,featured:!1,rewardPerAction:25,status:"active",startDate:"2026-06-01",endDate:"2026-08-31",tags:["defi","swap"],category:"DeFi",imageUrl:null},l={args:{campaign:c}},u={args:{campaign:{...c,featured:!0,name:"Featured Airdrop Campaign"}}},m={args:{campaign:{...c,active:!1,status:"ended",name:"Ended Campaign"}}},g={args:{campaign:{...c,status:"upcoming",startDate:"2027-01-01",name:"Upcoming Campaign"}}},p={args:{campaign:{...c,imageUrl:"https://via.placeholder.com/400x200?text=Campaign+Banner"}}},f={args:{campaign:c,loading:!0}},h={args:{campaign:{...c,featured:!0}},parameters:{backgrounds:{default:"dark"}}};var j,y,x;l.parameters={...l.parameters,docs:{...(j=l.parameters)==null?void 0:j.docs,source:{originalSource:`{
  args: {
    campaign: baseCampaign
  }
}`,...(x=(y=l.parameters)==null?void 0:y.docs)==null?void 0:x.source}}};var S,D,_;u.parameters={...u.parameters,docs:{...(S=u.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    campaign: {
      ...baseCampaign,
      featured: true,
      name: 'Featured Airdrop Campaign'
    }
  }
}`,...(_=(D=u.parameters)==null?void 0:D.docs)==null?void 0:_.source}}};var C,v,I;m.parameters={...m.parameters,docs:{...(C=m.parameters)==null?void 0:C.docs,source:{originalSource:`{
  args: {
    campaign: {
      ...baseCampaign,
      active: false,
      status: 'ended',
      name: 'Ended Campaign'
    }
  }
}`,...(I=(v=m.parameters)==null?void 0:v.docs)==null?void 0:I.source}}};var E,T,U;g.parameters={...g.parameters,docs:{...(E=g.parameters)==null?void 0:E.docs,source:{originalSource:`{
  args: {
    campaign: {
      ...baseCampaign,
      status: 'upcoming',
      startDate: '2027-01-01',
      name: 'Upcoming Campaign'
    }
  }
}`,...(U=(T=g.parameters)==null?void 0:T.docs)==null?void 0:U.source}}};var w,F,A;p.parameters={...p.parameters,docs:{...(w=p.parameters)==null?void 0:w.docs,source:{originalSource:`{
  args: {
    campaign: {
      ...baseCampaign,
      imageUrl: 'https://via.placeholder.com/400x200?text=Campaign+Banner'
    }
  }
}`,...(A=(F=p.parameters)==null?void 0:F.docs)==null?void 0:A.source}}};var L,O,M;f.parameters={...f.parameters,docs:{...(L=f.parameters)==null?void 0:L.docs,source:{originalSource:`{
  args: {
    campaign: baseCampaign,
    loading: true
  }
}`,...(M=(O=f.parameters)==null?void 0:O.docs)==null?void 0:M.source}}};var k,B,G;h.parameters={...h.parameters,docs:{...(k=h.parameters)==null?void 0:k.docs,source:{originalSource:`{
  args: {
    campaign: {
      ...baseCampaign,
      featured: true
    }
  },
  parameters: {
    backgrounds: {
      default: 'dark'
    }
  }
}`,...(G=(B=h.parameters)==null?void 0:B.docs)==null?void 0:G.source}}};const ne=["Active","Featured","Inactive","Upcoming","WithImage","LoadingSkeleton","DarkMode"];export{l as Active,h as DarkMode,u as Featured,m as Inactive,f as LoadingSkeleton,g as Upcoming,p as WithImage,ne as __namedExportsOrder,re as default};
