import type {HostPort} from './host.ts';

export type AttributeContract={type:string;required?:boolean;description:string};
export type ComponentContract={description:string;children:boolean;attributes:Record<string,AttributeContract>};
const attribute=(type:string,description:string,required=false):AttributeContract=>({type,description,required});
export const commonAttributes:Record<string,AttributeContract>={
 id:attribute('String','静态节点标识'),class:attribute('String','静态样式类名'),title:attribute('String','静态标题；Report 用于文档标题及 UseReport 链接名'),lang:attribute('String','静态语言标记'),
 'data-oks-shrink':attribute('String','静态布局收缩配置')
};
const content=(description:string):ComponentContract=>({description,children:true,attributes:{}});
export const builtinComponents:Record<string,ComponentContract>={
 Answer:content('交付给用户的回答根节点'),Report:content('独立报告根节点，通过 UseReport 引用'),
 section:content('内容分节'),h1:content('一级标题'),h2:content('二级标题'),h3:content('三级标题'),p:content('段落'),div:content('块级内容容器'),span:content('行内容器'),ul:content('无序列表'),ol:content('有序列表'),li:content('列表项'),blockquote:content('引用块'),pre:content('预格式化文本'),code:content('代码文本'),strong:content('强调内容'),em:content('斜体强调内容'),
 a:{...content('静态超链接'),attributes:{href:attribute('String','静态 http、mailto、片段或绝对路径链接',true)}},
 br:{description:'换行',children:false,attributes:{}},hr:{description:'分隔线',children:false,attributes:{}},
 Lit:{description:'显式确认的固定文案，可包含静态数字',children:false,attributes:{value:attribute('String','静态文案；查询结果使用 UseValue 引用',true)}},
 UseValue:{description:'展示已准备好的标量引用，保留数据来源',children:false,attributes:{ref:attribute('Scalar | Option(Scalar)','直接引用 data、局部值或其字段；计算和默认值处理在前序完成',true),precision:attribute('Int','展示的小数位数'),format:attribute('TimeFormat','与被引用值类型匹配的时间展示格式')}},
 Table:{description:'展示有明确行数上界的表格',children:false,attributes:{data:attribute('Table(Schema) | Pivot(Index, Key, Value)','表数据引用；已证明的行数上界不超过 110',true),spec:attribute('Schema','表格配置：columns、labels、title、precision、allow_no_data、formats、value_labels')}},
 ColumnChart:{description:'柱图',children:false,attributes:{data:attribute('Table(Schema)','有界表数据引用',true),x:attribute('Projection','横轴字段选择器，如 $.name',true),value:attribute('Projection','数值字段选择器，如 $.value',true)}},
 UseReport:{description:'引用独立报告，链接名使用报告的 title',children:false,attributes:{ref:attribute('Report','已声明的 report 引用',true)}}
};
export function componentContract(name:string,host?:HostPort):ComponentContract|undefined{
 if(host?.components.includes(name))return (name==='Table'?builtinComponents.Table:host.componentContracts?.[name])??{
  description:'宿主提供的 '+name+' 图表组件；具体 spec 由宿主校验',children:false,attributes:{
   data:attribute('Table(Schema)','图表输入表引用；已证明的行数上界不超过 110',true),
   nodes:attribute('Table(Schema)','可选节点数据引用；已证明的行数上界不超过 110'),
   spec:attribute('Schema','图表配置；用 $.field 选择输入表字段')
  }
 };
 return builtinComponents[name];
}
