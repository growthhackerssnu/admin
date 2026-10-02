import { useState } from "react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import "./palette-draft.css";

export const proposedBrand = [
  ["0", "#000205"], ["100", "#00152E"], ["200", "#012957"],
  ["300 · 기준", "#01397C"], ["400", "#0155B8"], ["500", "#1671D9"],
  ["600", "#498FE0"], ["700", "#7DAFE8"], ["800", "#B1CFF1"], ["900", "#E5EFF9"],
];

const states = { ready: "승인 가능", editing: "입력 중", empty: "관계자 없음", error: "입력 오류", processed: "처리 완료" };
type SampleState = keyof typeof states;
const initialContact = { name: "김민수", title: "사업개발 매니저", address: "https://www.linkedin.com/in/example/" };

export function PaletteDraft() {
  const [state, setState] = useState<SampleState>("ready");
  const [contact, setContact] = useState(initialContact);
  const [memo, setMemo] = useState("팀 단위로 반복 업무를 자동화하는 B2B SaaS. 고객의 사용 흐름과 주요 기능을 확인했고, 사업개발 관계자에게 프로젝트 협업을 제안할 수 있는지 검토한다.");
  const invalid = !contact.name.trim() || !/^https:\/\/(www\.)?linkedin\.com\/in\/.+/.test(contact.address);
  function changeState(next: SampleState) {
    setState(next);
    setContact(next === "empty" || next === "editing" ? { name: "", title: "", address: "" } : next === "error" ? { ...initialContact, address: "linkedin-profile" } : initialContact);
  }

  return <section id="palette-draft" className="pd-section">
    <p className="ds-overline">06 / Palette proposal</p>
    <h2 className="ds-headline-5">로고 파랑으로 맞춘 색상 · B안 적용</h2>
    <p className="ds-body-2 ds-muted">선택된 B안을 공통 토큰과 업무 화면에 적용했습니다. A안은 선택 과정의 비교 기록입니다.</p>
    <div className="pd-swatches">{proposedBrand.map(([label, hex]) => <div key={label}><div className="pd-swatch" style={{ background: hex }} /><span>{label}</span><code>{hex}</code></div>)}</div>
    <div className="pd-controls" aria-label="두 안의 공통 상태"><span>같은 상태로 비교</span><div>{Object.entries(states).map(([key, label]) => <Button key={key} size="sm" variant={state === key ? "secondary" : "ghost"} aria-pressed={state === key} onClick={() => changeState(key as SampleState)}>{label}</Button>)}</div></div>
    <div className="pd-comparison">{(["a", "b"] as const).map(option => <article key={option} className="pd-option">
      <header className="pd-option-label"><h3>{option === "a" ? "A · 승인색 유지" : "B · 브랜드색 통일 · 선택"}</h3><code>{option === "a" ? "#0042D1" : "#01397C"}</code></header>
      <div className="pd-sample" data-option={option}>
        <div className="pd-sample-header"><BrandLogo width={132} /><Badge variant="outline"><span className={`pd-status-dot pd-status-${state}`} />{states[state]}</Badge></div>
        <div className="pd-sample-body">
          <div className="pd-company"><span className="pd-eyebrow">내 담당 · {state === "processed" ? "처리 완료" : "검토 전"}</span><h4>모닝루프 <span>Morningloop</span></h4><p>반복 업무를 자동화하는 B2B SaaS. 팀의 업무 흐름을 연결하고, 서비스 이용 데이터를 바탕으로 업무 효율을 개선합니다.</p></div>
          <div className="pd-contact-heading"><h4>연락할 관계자</h4><a href="https://www.linkedin.com/search/results/people/?keywords=Morningloop" target="_blank" rel="noreferrer">LinkedIn에서 찾기</a></div>
          {state === "empty" ? <div className="pd-empty"><span>관계자 정보 없음</span><Button variant="outline" onClick={() => changeState("editing")}>관계자 추가</Button></div> : <>
            <div className="pd-fields">
              <Field><FieldLabel htmlFor={`pd-${option}-name`} required>이름</FieldLabel><Input id={`pd-${option}-name`} value={contact.name} placeholder="이름" aria-required="true" disabled={state === "processed"} onChange={e => setContact({ ...contact, name: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor={`pd-${option}-title`}>직함</FieldLabel><Input id={`pd-${option}-title`} value={contact.title} placeholder="직함" disabled={state === "processed"} onChange={e => setContact({ ...contact, title: e.target.value })} /></Field>
              <Field><FieldLabel htmlFor={`pd-${option}-channel`}>채널</FieldLabel><Input id={`pd-${option}-channel`} value="LinkedIn" readOnly /></Field>
              <Field><FieldLabel htmlFor={`pd-${option}-address`} required>프로필 링크</FieldLabel><Input id={`pd-${option}-address`} value={contact.address} placeholder="https://www.linkedin.com/in/…" aria-required="true" aria-invalid={state === "error" && invalid} aria-describedby={state === "error" && invalid ? `pd-${option}-error` : undefined} disabled={state === "processed"} onChange={e => setContact({ ...contact, address: e.target.value })} /></Field>
            </div>
            {state === "error" && invalid && <p id={`pd-${option}-error`} className="pd-error">LinkedIn 개인 프로필 주소를 확인해주세요.</p>}
            {state !== "processed" && <Button className="pd-save" disabled={invalid} onClick={() => setState("ready")}>관계자 저장</Button>}
          </>}
          <Field className="pd-note"><FieldLabel htmlFor={`pd-${option}-memo`}>판단 메모</FieldLabel><Textarea id={`pd-${option}-memo`} value={memo} disabled={state === "processed"} onChange={e => setMemo(e.target.value)} /></Field>
        </div>
        <footer className="pd-actions">{state === "processed" ? <Button variant="outline" onClick={() => changeState("ready")}>판단 변경</Button> : <><Button variant="destructive" onClick={() => setState("processed")}>fit 부적합</Button><Button className="pd-approve" disabled={invalid || state === "empty"} onClick={() => setState("processed")}>승인</Button></>}{(invalid || state === "empty") && state !== "processed" && <span className="pd-disabled-reason">이름·프로필 링크 입력 후 승인 가능 · <button className="pd-input-path" onClick={() => state === "empty" ? changeState("editing") : document.getElementById(`pd-${option}-${contact.name.trim() ? "address" : "name"}`)?.focus()}>입력으로 이동</button></span>}</footer>
      </div>
      <p className="pd-option-note">{option === "a" ? "승인이 일반 저장보다 강하게 보입니다. 기존 승인색을 그대로 유지합니다." : "로고·저장·승인에 같은 파랑을 사용합니다. 승인과 저장은 배치로 구분합니다."}</p>
    </article>)}</div>
    <p className="pd-condition">공통 조건: 같은 기업·긴 설명·관계자·메모·상태, 같은 패널 높이 640px와 간격. 입력과 상태는 양쪽에 함께 반영됩니다. 버튼은 상태 예시를 전환하며 데이터를 저장하지 않습니다.</p>
    <div className="pd-table-wrap"><table className="pd-role-table"><caption>역할별 토큰 제안 · 수치는 자체 제안값</caption><thead><tr><th>역할</th><th>색상</th><th>적용 위치</th></tr></thead><tbody>
      <tr><td>브랜드 기준</td><td>#01397C</td><td>로고, 기본 버튼</td></tr>
      <tr><td>진한 글씨</td><td>#00152E</td><td>제목, 입력, 메뉴</td></tr>
      <tr><td>링크·포커스</td><td>#0155B8</td><td>링크, 키보드 포커스</td></tr>
      <tr><td>기본 버튼 hover</td><td>#012957</td><td>저장과 B 승인 버튼</td></tr>
      <tr><td>승인 버튼</td><td>A #0042D1 / B #01397C</td><td>B #01397C 선택 완료</td></tr>
      <tr><td>밝은 표면</td><td>#E1E7F3 / #F8FAFE / #FFFFFF</td><td>현재 사이드바 / 목록 / 작업 영역 유지</td></tr>
      <tr><td>상태 의미</td><td>기존 semantic 유지</td><td>작은 상태 점, 오류·거절 표시</td></tr>
    </tbody></table></div>
    <p className="pd-condition">공통 토큰·컴포넌트·업무 화면·갤러리에 B안을 반영했습니다. 브랜드 스케일은 기존처럼 숫자가 커질수록 밝아집니다.</p>
  </section>;
}
