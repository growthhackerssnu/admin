// Production integration points. No message templates are supplied in this mockup.
const OutreachPolicy=(()=>{
 const reasons=['리소스 부족','무관심','문제 해결 수요 없음','기타'];
 const templates={'신규 컨택':null,'다른 관계자':null,'재접촉':null,'재협업':null};
 const contacts=[{id:'sample-seoyeon',name:'박서연',role:'사업개발 리드',email:'partner@company.example',linkedin:'https://www.linkedin.com/in/sample-seoyeon/'},{id:'sample-doyoon',name:'이도윤',role:'프로덕트 매니저',email:'product@company.example',linkedin:'https://www.linkedin.com/in/sample-doyoon/'}];
 function excluded(company,person){return (company.prelaunchContacts||[]).some(p=>(p.id&&p.id===person.id)||(p.linkedin&&p.linkedin.replace(/\/$/,'')===person.linkedin?.replace(/\/$/,''))||(p.email&&p.email.toLowerCase()===person.email?.toLowerCase()));}
 function migrate(items,cycleId){return items.map(x=>({...x,...(x.prelaunchOnly&&!x.lastSentCycleId&&!x.sentRecords?.length?{route:'신규 컨택'}:{}),stage:x.stage.replaceAll('분기','차수'),last:x.last?.replaceAll('분기','차수'),cycleId:x.cycleId||cycleId,lastSentCycleId:x.lastSentCycleId||(x.last==='이번 분기'||x.last==='이번 차수'?cycleId:null)}));}
 function startCycle(items,cycle){return items.map(x=>({...x,last:x.last==='이번 차수'?'이전 차수':x.last,...(x.stage==='이번 차수 건너뛰기'?{stage:'기업 검토',cycleId:cycle.id,skipCycleId:null,history:[...x.history,cycle.name+' · 검토 대상으로 복귀']}:{}),...(x.stage==='응답 확인'&&x.lastSentCycleId!==cycle.id?{confirmed:false}: {})}));}
 function renderTemplate(template,vars){if(!template?.id||!template?.version||!template.subject||!template.body)throw Error('템플릿 연결 필요');const render=s=>s.replace(/{{\s*(\w+)\s*}}/g,(_,key)=>{if(!(key in vars))throw Error('템플릿 변수 누락: '+key);return vars[key]??'';});return {subject:render(template.subject),body:render(template.body),templateUsed:{id:template.id,version:template.version}};}
 function validReason(result,category,note){return !['거절','보류'].includes(result)||(reasons.includes(category)&&(category!=='기타'||!!note?.trim()));}
 return {reasons,templates,contacts,excluded,migrate,startCycle,renderTemplate,validReason};
})();
if(typeof module!=='undefined')module.exports=OutreachPolicy;
