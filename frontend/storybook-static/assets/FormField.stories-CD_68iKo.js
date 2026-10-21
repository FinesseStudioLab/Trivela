import{j as e}from"./jsx-runtime-Z5uAzocK.js";import{r as d}from"./index-pP6CS22B.js";/* empty css               */import"./_commonjsHelpers-Cpj98o6Y.js";function c({type:o="text",label:m,name:u,value:p,onChange:E,onBlur:R,placeholder:i,error:r,warning:s,success:t,hint:a,required:l=!1,disabled:n=!1,readOnly:Oe=!1,autoComplete:Me,autoFocus:$e=!1,min:Le,max:Ze,step:ze,minLength:T,maxLength:V,pattern:He,options:W,rows:Je=4,className:Ke="",inputClassName:Qe="","aria-describedby":Ue,...Xe}){const B=d.useId(),G=d.useId(),k=d.useId(),O=d.useId(),M=d.useId(),Ye=[Ue,a&&G,r&&k,s&&O,t&&M].filter(Boolean).join(" "),ea=r||s||t,aa=r?"error":s?"warning":t?"success":null,I={id:B,name:u,value:p,onChange:E,onBlur:R,disabled:n,readOnly:Oe,autoFocus:$e,required:l,"aria-describedby":Ye||void 0,"aria-invalid":r?!0:void 0,className:`ds-field__input ds-field__input--${o} ${Qe}`.trim(),...Xe},ra=()=>{switch(o){case"select":return e.jsxs("select",{...I,children:[i&&e.jsx("option",{value:"",disabled:l,children:i}),W==null?void 0:W.map(g=>e.jsx("option",{value:g.value,disabled:g.disabled,children:g.label},g.value))]});case"textarea":return e.jsx("textarea",{...I,rows:Je,minLength:T,maxLength:V,placeholder:i});default:return e.jsx("input",{...I,type:o,placeholder:i,autoComplete:Me,min:Le,max:Ze,step:ze,minLength:T,maxLength:V,pattern:He})}};return e.jsxs("div",{className:`ds-field ${ea?`ds-field--${aa}`:""} ${Ke}`.trim(),"data-disabled":n||void 0,children:[m&&e.jsxs("label",{htmlFor:B,className:"ds-field__label",children:[m,l&&e.jsx("span",{className:"ds-field__required","aria-hidden":"true",children:"*"})]}),e.jsxs("div",{className:"ds-field__input-wrapper",children:[ra(),t&&!r&&!s&&e.jsx("span",{className:"ds-field__icon ds-field__icon--success","aria-hidden":"true",children:e.jsx("svg",{viewBox:"0 0 24 24",width:"18",height:"18",fill:"none",stroke:"currentColor",strokeWidth:"2",children:e.jsx("path",{d:"M20 6L9 17l-5-5"})})}),r&&e.jsx("span",{className:"ds-field__icon ds-field__icon--error","aria-hidden":"true",children:e.jsxs("svg",{viewBox:"0 0 24 24",width:"18",height:"18",fill:"none",stroke:"currentColor",strokeWidth:"2",children:[e.jsx("circle",{cx:"12",cy:"12",r:"10"}),e.jsx("path",{d:"M12 8v4M12 16h.01"})]})})]}),a&&!r&&!s&&!t&&e.jsx("p",{id:G,className:"ds-field__hint",children:a}),r&&e.jsx("p",{id:k,className:"ds-field__error",role:"alert",children:r}),s&&!r&&e.jsx("p",{id:O,className:"ds-field__warning",children:s}),t&&!r&&!s&&e.jsx("p",{id:M,className:"ds-field__success",children:t})]})}function ke({children:o,legend:m,className:u=""}){return e.jsxs("fieldset",{className:`ds-field-group ${u}`.trim(),children:[m&&e.jsx("legend",{className:"ds-field-group__legend",children:m}),o]})}c.__docgenInfo={description:"FormField — accessible, themeable form input with validation.",methods:[],displayName:"FormField",props:{type:{defaultValue:{value:"'text'",computed:!1},required:!1},required:{defaultValue:{value:"false",computed:!1},required:!1},disabled:{defaultValue:{value:"false",computed:!1},required:!1},readOnly:{defaultValue:{value:"false",computed:!1},required:!1},autoFocus:{defaultValue:{value:"false",computed:!1},required:!1},rows:{defaultValue:{value:"4",computed:!1},required:!1},className:{defaultValue:{value:"''",computed:!1},required:!1},inputClassName:{defaultValue:{value:"''",computed:!1},required:!1}}};ke.__docgenInfo={description:"FormFieldGroup — container for grouping related fields.",methods:[],displayName:"FormFieldGroup",props:{className:{defaultValue:{value:"''",computed:!1},required:!1}}};const ia={title:"Design System/FormField",component:c,tags:["autodocs"],parameters:{layout:"padded",docs:{description:{component:"Accessible, themeable form fields with validation states. Supports text, number, email, password, select, and textarea inputs. Wired to Zod validation library."}}},argTypes:{type:{control:"inline-radio",options:["text","email","password","number","select","textarea"]},required:{control:"boolean"},disabled:{control:"boolean"},onChange:{action:"changed"},onBlur:{action:"blurred"}}},b={args:{type:"text",label:"Campaign Name",name:"name",value:"",placeholder:"Enter campaign name",hint:"Choose a descriptive name for your campaign"}},h={args:{type:"text",label:"Campaign Name",name:"name",value:"",placeholder:"Required field",required:!0}},y={args:{type:"text",label:"Campaign Name",name:"name",value:"",error:"Name is required and must be at least 3 characters"}},f={args:{type:"text",label:"Campaign Slug",name:"slug",value:"my-campaign",warning:"Changing the slug will break existing links"}},v={args:{type:"text",label:"Campaign Slug",name:"slug",value:"my-awesome-campaign",success:"Slug is available"}},x={args:{type:"number",label:"Reward Per Action",name:"rewardPerAction",value:25,min:0,max:1e3,step:1,hint:"Points awarded for each completed action"}},F={args:{type:"number",label:"Reward Per Action",name:"rewardPerAction",value:-5,error:"Reward must be a non-negative number"}},w={args:{type:"email",label:"Email Address",name:"email",value:"",placeholder:"you@example.com",autoComplete:"email"}},C={args:{type:"password",label:"Password",name:"password",value:"",placeholder:"Enter password",hint:"Must be at least 8 characters"}},N={args:{type:"select",label:"Category",name:"category",value:"",placeholder:"Select a category",options:[{value:"defi",label:"DeFi"},{value:"nft",label:"NFT"},{value:"community",label:"Community"},{value:"airdrop",label:"Airdrop"}]}},S={args:{type:"select",label:"Category",name:"category",value:"",placeholder:"Select a category",error:"Please select a category",options:[{value:"defi",label:"DeFi"},{value:"nft",label:"NFT"},{value:"community",label:"Community"},{value:"airdrop",label:"Airdrop"}]}},j={args:{type:"textarea",label:"Description",name:"description",value:"",placeholder:"Describe your campaign...",rows:4,maxLength:500}},_={args:{type:"text",label:"Disabled Field",name:"disabled",value:"Cannot edit this",disabled:!0}},A={args:{type:"text",label:"Read-Only Field",name:"readonly",value:"Contract ID: CABC123...",readOnly:!0,hint:"Copied to clipboard on click"}};function ta(){const[o,m]=d.useState({name:"",rewardPerAction:"",category:""}),[u,p]=d.useState({}),[E,R]=d.useState({}),i=(t,a)=>{switch(t){case"name":return a.trim()?a.length<3?"Name must be at least 3 characters":a.length>50?"Name must be at most 50 characters":null:"Name is required";case"rewardPerAction":return a?parseFloat(a)<0?"Reward must be non-negative":parseFloat(a)>1e3?"Reward cannot exceed 1000":null:"Reward is required";case"category":return a?null:"Please select a category";default:return null}},r=t=>{const{name:a,value:l}=t.target;m(n=>({...n,[a]:l})),E[a]&&p(n=>({...n,[a]:i(a,l)}))},s=t=>{const{name:a,value:l}=t.target;R(n=>({...n,[a]:!0})),p(n=>({...n,[a]:i(a,l)}))};return e.jsxs("form",{onSubmit:t=>{t.preventDefault();const a={};Object.keys(o).forEach(l=>{const n=i(l,o[l]);n&&(a[l]=n)}),p(a),Object.keys(a).length===0&&alert("Form submitted successfully!")},style:{display:"flex",flexDirection:"column",gap:"1.5rem",maxWidth:"400px"},children:[e.jsx(c,{type:"text",label:"Campaign Name",name:"name",value:o.name,onChange:r,onBlur:s,error:u.name,required:!0}),e.jsx(c,{type:"number",label:"Reward Per Action",name:"rewardPerAction",value:o.rewardPerAction,onChange:r,onBlur:s,error:u.rewardPerAction,min:0,max:1e3,required:!0}),e.jsx(c,{type:"select",label:"Category",name:"category",value:o.category,onChange:r,onBlur:s,error:u.category,options:[{value:"defi",label:"DeFi"},{value:"nft",label:"NFT"},{value:"community",label:"Community"},{value:"airdrop",label:"Airdrop"}],required:!0}),e.jsx("button",{type:"submit",className:"btn btn-primary",children:"Submit"})]})}const D={render:()=>e.jsx(ta,{}),parameters:{docs:{description:{story:"Form fields with real-time validation. Errors appear on blur and clear on change."}}}},P={render:()=>e.jsxs(ke,{legend:"Campaign Settings",style:{display:"flex",flexDirection:"column",gap:"1rem"},children:[e.jsx(c,{type:"text",label:"Campaign Name",name:"name",value:""}),e.jsx(c,{type:"number",label:"Reward",name:"reward",value:0,min:0}),e.jsx(c,{type:"select",label:"Category",name:"category",value:"",options:[{value:"defi",label:"DeFi"},{value:"nft",label:"NFT"}]})]}),parameters:{docs:{description:{story:"Group related fields with a shared legend using FormFieldGroup."}}}},q={args:{type:"text",label:"Campaign Name",name:"name",value:"My Campaign"},globals:{theme:"light"}};var $,L,Z;b.parameters={...b.parameters,docs:{...($=b.parameters)==null?void 0:$.docs,source:{originalSource:`{
  args: {
    type: 'text',
    label: 'Campaign Name',
    name: 'name',
    value: '',
    placeholder: 'Enter campaign name',
    hint: 'Choose a descriptive name for your campaign'
  }
}`,...(Z=(L=b.parameters)==null?void 0:L.docs)==null?void 0:Z.source}}};var z,H,J;h.parameters={...h.parameters,docs:{...(z=h.parameters)==null?void 0:z.docs,source:{originalSource:`{
  args: {
    type: 'text',
    label: 'Campaign Name',
    name: 'name',
    value: '',
    placeholder: 'Required field',
    required: true
  }
}`,...(J=(H=h.parameters)==null?void 0:H.docs)==null?void 0:J.source}}};var K,Q,U;y.parameters={...y.parameters,docs:{...(K=y.parameters)==null?void 0:K.docs,source:{originalSource:`{
  args: {
    type: 'text',
    label: 'Campaign Name',
    name: 'name',
    value: '',
    error: 'Name is required and must be at least 3 characters'
  }
}`,...(U=(Q=y.parameters)==null?void 0:Q.docs)==null?void 0:U.source}}};var X,Y,ee;f.parameters={...f.parameters,docs:{...(X=f.parameters)==null?void 0:X.docs,source:{originalSource:`{
  args: {
    type: 'text',
    label: 'Campaign Slug',
    name: 'slug',
    value: 'my-campaign',
    warning: 'Changing the slug will break existing links'
  }
}`,...(ee=(Y=f.parameters)==null?void 0:Y.docs)==null?void 0:ee.source}}};var ae,re,te;v.parameters={...v.parameters,docs:{...(ae=v.parameters)==null?void 0:ae.docs,source:{originalSource:`{
  args: {
    type: 'text',
    label: 'Campaign Slug',
    name: 'slug',
    value: 'my-awesome-campaign',
    success: 'Slug is available'
  }
}`,...(te=(re=v.parameters)==null?void 0:re.docs)==null?void 0:te.source}}};var ne,se,le;x.parameters={...x.parameters,docs:{...(ne=x.parameters)==null?void 0:ne.docs,source:{originalSource:`{
  args: {
    type: 'number',
    label: 'Reward Per Action',
    name: 'rewardPerAction',
    value: 25,
    min: 0,
    max: 1000,
    step: 1,
    hint: 'Points awarded for each completed action'
  }
}`,...(le=(se=x.parameters)==null?void 0:se.docs)==null?void 0:le.source}}};var oe,ie,de;F.parameters={...F.parameters,docs:{...(oe=F.parameters)==null?void 0:oe.docs,source:{originalSource:`{
  args: {
    type: 'number',
    label: 'Reward Per Action',
    name: 'rewardPerAction',
    value: -5,
    error: 'Reward must be a non-negative number'
  }
}`,...(de=(ie=F.parameters)==null?void 0:ie.docs)==null?void 0:de.source}}};var ce,me,ue;w.parameters={...w.parameters,docs:{...(ce=w.parameters)==null?void 0:ce.docs,source:{originalSource:`{
  args: {
    type: 'email',
    label: 'Email Address',
    name: 'email',
    value: '',
    placeholder: 'you@example.com',
    autoComplete: 'email'
  }
}`,...(ue=(me=w.parameters)==null?void 0:me.docs)==null?void 0:ue.source}}};var pe,ge,be;C.parameters={...C.parameters,docs:{...(pe=C.parameters)==null?void 0:pe.docs,source:{originalSource:`{
  args: {
    type: 'password',
    label: 'Password',
    name: 'password',
    value: '',
    placeholder: 'Enter password',
    hint: 'Must be at least 8 characters'
  }
}`,...(be=(ge=C.parameters)==null?void 0:ge.docs)==null?void 0:be.source}}};var he,ye,fe;N.parameters={...N.parameters,docs:{...(he=N.parameters)==null?void 0:he.docs,source:{originalSource:`{
  args: {
    type: 'select',
    label: 'Category',
    name: 'category',
    value: '',
    placeholder: 'Select a category',
    options: [{
      value: 'defi',
      label: 'DeFi'
    }, {
      value: 'nft',
      label: 'NFT'
    }, {
      value: 'community',
      label: 'Community'
    }, {
      value: 'airdrop',
      label: 'Airdrop'
    }]
  }
}`,...(fe=(ye=N.parameters)==null?void 0:ye.docs)==null?void 0:fe.source}}};var ve,xe,Fe;S.parameters={...S.parameters,docs:{...(ve=S.parameters)==null?void 0:ve.docs,source:{originalSource:`{
  args: {
    type: 'select',
    label: 'Category',
    name: 'category',
    value: '',
    placeholder: 'Select a category',
    error: 'Please select a category',
    options: [{
      value: 'defi',
      label: 'DeFi'
    }, {
      value: 'nft',
      label: 'NFT'
    }, {
      value: 'community',
      label: 'Community'
    }, {
      value: 'airdrop',
      label: 'Airdrop'
    }]
  }
}`,...(Fe=(xe=S.parameters)==null?void 0:xe.docs)==null?void 0:Fe.source}}};var we,Ce,Ne;j.parameters={...j.parameters,docs:{...(we=j.parameters)==null?void 0:we.docs,source:{originalSource:`{
  args: {
    type: 'textarea',
    label: 'Description',
    name: 'description',
    value: '',
    placeholder: 'Describe your campaign...',
    rows: 4,
    maxLength: 500
  }
}`,...(Ne=(Ce=j.parameters)==null?void 0:Ce.docs)==null?void 0:Ne.source}}};var Se,je,_e;_.parameters={..._.parameters,docs:{...(Se=_.parameters)==null?void 0:Se.docs,source:{originalSource:`{
  args: {
    type: 'text',
    label: 'Disabled Field',
    name: 'disabled',
    value: 'Cannot edit this',
    disabled: true
  }
}`,...(_e=(je=_.parameters)==null?void 0:je.docs)==null?void 0:_e.source}}};var Ae,De,Pe;A.parameters={...A.parameters,docs:{...(Ae=A.parameters)==null?void 0:Ae.docs,source:{originalSource:`{
  args: {
    type: 'text',
    label: 'Read-Only Field',
    name: 'readonly',
    value: 'Contract ID: CABC123...',
    readOnly: true,
    hint: 'Copied to clipboard on click'
  }
}`,...(Pe=(De=A.parameters)==null?void 0:De.docs)==null?void 0:Pe.source}}};var qe,Ee,Re;D.parameters={...D.parameters,docs:{...(qe=D.parameters)==null?void 0:qe.docs,source:{originalSource:`{
  render: () => <ValidationDemo />,
  parameters: {
    docs: {
      description: {
        story: 'Form fields with real-time validation. Errors appear on blur and clear on change.'
      }
    }
  }
}`,...(Re=(Ee=D.parameters)==null?void 0:Ee.docs)==null?void 0:Re.source}}};var We,Ie,Te;P.parameters={...P.parameters,docs:{...(We=P.parameters)==null?void 0:We.docs,source:{originalSource:`{
  render: () => <FormFieldGroup legend="Campaign Settings" style={{
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  }}>
      <FormField type="text" label="Campaign Name" name="name" value="" />
      <FormField type="number" label="Reward" name="reward" value={0} min={0} />
      <FormField type="select" label="Category" name="category" value="" options={[{
      value: 'defi',
      label: 'DeFi'
    }, {
      value: 'nft',
      label: 'NFT'
    }]} />
    </FormFieldGroup>,
  parameters: {
    docs: {
      description: {
        story: 'Group related fields with a shared legend using FormFieldGroup.'
      }
    }
  }
}`,...(Te=(Ie=P.parameters)==null?void 0:Ie.docs)==null?void 0:Te.source}}};var Ve,Be,Ge;q.parameters={...q.parameters,docs:{...(Ve=q.parameters)==null?void 0:Ve.docs,source:{originalSource:`{
  args: {
    type: 'text',
    label: 'Campaign Name',
    name: 'name',
    value: 'My Campaign'
  },
  globals: {
    theme: 'light'
  }
}`,...(Ge=(Be=q.parameters)==null?void 0:Be.docs)==null?void 0:Ge.source}}};const da=["Text","Required","WithError","WithWarning","WithSuccess","NumberField","NumberWithError","Email","Password","Select","SelectWithError","Textarea","Disabled","ReadOnly","WithValidation","FieldGroup","LightTheme"];export{_ as Disabled,w as Email,P as FieldGroup,q as LightTheme,x as NumberField,F as NumberWithError,C as Password,A as ReadOnly,h as Required,N as Select,S as SelectWithError,b as Text,j as Textarea,y as WithError,v as WithSuccess,D as WithValidation,f as WithWarning,da as __namedExportsOrder,ia as default};
