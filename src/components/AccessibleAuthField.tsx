import { Children, cloneElement, isValidElement, useId, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

/** Labels the field's first form control, including nested password wrappers. */
export default function AccessibleAuthField({label,error,required,children}:{
  label:string; error?:string; required?:boolean; children:ReactNode;
}) {
  const id=useId();
  let assigned=false;
  const connect=(nodes:ReactNode):ReactNode=>Children.map(nodes,node=>{
    if(!isValidElement<Record<string,unknown>>(node))return node;
    if(!assigned && ['input','select','textarea'].includes(String(node.type))){
      assigned=true;
      return cloneElement(node,{id,'aria-invalid':!!error,'aria-required':required||undefined,
        'aria-describedby':error?`${id}-error`:node.props['aria-describedby']});
    }
    return node.props.children?cloneElement(node,{},connect(node.props.children as ReactNode)):node;
  });
  return <div className="space-y-1">
    <label htmlFor={id} className="text-sm font-medium text-charcoal">
      {label}{required&&<span aria-hidden="true" className="text-gentle-coral ml-0.5">*</span>}
    </label>
    {connect(children)}
    {error&&<p id={`${id}-error`} role="alert" className="flex items-center gap-1 text-xs text-gentle-coral">
      <AlertCircle aria-hidden="true" className="w-3 h-3 flex-shrink-0"/>{error}
    </p>}
  </div>;
}
