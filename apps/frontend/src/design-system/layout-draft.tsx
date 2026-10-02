import React from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ListFilter } from "@/components/ui/list-filter";
import { UserRound } from "lucide-react";
import "./layout-draft.css";

const spacing = [
  ["8px", "라벨 ↔ 입력 · 아이콘 ↔ 글자", "--layout-label-gap"],
  ["12px", "같은 줄의 버튼 · 도구", "--layout-control-gap"],
  ["16px", "입력칸 사이 · 반복 정보", "--layout-field-gap"],
  ["20px", "패널 좌우 내용 시작선", "--layout-inset"],
  ["24px", "같은 작업 안의 그룹", "--layout-group-gap"],
  ["32px", "서로 다른 주요 영역", "--layout-section-gap"],
];

export function LayoutDraft() {
  const [width, setWidth] = React.useState(620);
  const [state, setState] = React.useState("editing");
  const [guides, setGuides] = React.useState(true);
  const [measuredWidth, setMeasuredWidth] = React.useState(width);
  const [scrollbarWidth, setScrollbarWidth] = React.useState(0);
  const pane = React.useRef<HTMLDivElement>(null);
  const body = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (pane.current) setMeasuredWidth(Math.round(pane.current.getBoundingClientRect().width));
      if (body.current) setScrollbarWidth(body.current.offsetWidth - body.current.clientWidth);
    });
    if (pane.current) observer.observe(pane.current);
    if (body.current) observer.observe(body.current);
    return () => observer.disconnect();
  }, []);

  return <section id="layout-draft" className="ds-layout-draft">
    <p className="ds-overline">05 / Layout · Draft</p>
    <h2 className="ds-headline-5">여백과 너비 변화</h2>
    <p className="ds-body-2 ds-muted">검토용 제안값입니다. 현재 업무 화면에 적용하기 전에 이 예시로 정렬과 너비 변화를 확인합니다.</p>
    <h3 className="ds-subtitle-1 ds-layout-subhead">01. 역할별 여백</h3>
    <div className="ds-layout-spacing">{spacing.map(([value, role, token]) => <div key={token} className="ds-layout-spacing-row">
      <strong>{value}</strong><span>{role}</span><code>{token}</code>
    </div>)}</div>
    <p className="ds-layout-note">제목 · 본문 · 입력 · 메모 · 하단 행동은 같은 좌우 시작선을 씁니다. 목록은 바깥 8px + 행 안쪽 12px = 20px로 맞춥니다. 간격은 부모 한 곳에서 관리해 중복 여백을 피합니다.</p>
    <h3 className="ds-subtitle-1 ds-layout-subhead">02. 패널 너비 비교</h3>
    <div className="ds-layout-controls">
      <div className="ds-layout-width-buttons">{[360, 620, 840].map(size => <Button key={size} variant={width === size ? "secondary" : "ghost"} size="sm" onClick={() => setWidth(size)} aria-pressed={width === size}>{size}px</Button>)}</div>
      <ListFilter label="레이아웃 예시 상태" value={state} onChange={setState} options={[{ value: "editing", label: "입력 중" }, { value: "empty", label: "관계자 없음" }, { value: "error", label: "입력 오류" }]} />
      <label className="ds-layout-guide-toggle"><input type="checkbox" checked={guides} onChange={event => setGuides(event.target.checked)} /> 정렬선</label>
    </div>
    <div className="ds-layout-range"><label htmlFor="layout-width">패널 너비</label><input id="layout-width" type="range" min="320" max="840" step="10" value={width} onChange={event => setWidth(Number(event.target.value))} /><output htmlFor="layout-width">실제 {measuredWidth}px</output></div>
    <div className="ds-layout-stage">
      <div ref={pane} className={`ds-layout-pane${guides ? " ds-layout-guides" : ""}`} style={{ width, "--layout-scrollbar-size": `${scrollbarWidth}px` } as React.CSSProperties}>
        <header className="ds-layout-pane-head"><strong>모닝루프</strong><span>검토 중</span></header>
        <div ref={body} className="ds-layout-pane-body">
          <div className="ds-layout-section">
            <h4>연락할 관계자</h4>
            {state === "empty" ? <div className="ds-layout-empty"><UserRound size={28} aria-hidden /><strong>관계자 정보 없음</strong><Button variant="outline" onClick={() => setState("editing")}>관계자 추가</Button></div> : <>
              <div className="ds-layout-fields">
                <Field><FieldLabel htmlFor="layout-name" required>이름</FieldLabel><Input id="layout-name" defaultValue="김민수" aria-required="true" /></Field>
                <Field><FieldLabel htmlFor="layout-title">직함</FieldLabel><Input id="layout-title" defaultValue="사업개발 매니저" /></Field>
                <Field><FieldLabel htmlFor="layout-channel">채널</FieldLabel><Input id="layout-channel" value="LinkedIn" readOnly /></Field>
                <Field><FieldLabel htmlFor="layout-address" required>프로필 링크</FieldLabel><Input key={state} id="layout-address" defaultValue={state === "error" ? "linkedin-profile" : "https://www.linkedin.com/in/morningloop-contact"} aria-required="true" aria-invalid={state === "error"} aria-describedby={state === "error" ? "layout-address-error" : undefined} /></Field>
              </div>
              {state === "error" && <p id="layout-address-error" className="ds-layout-error">LinkedIn 개인 프로필 주소를 확인해주세요.</p>}
              <div className="ds-layout-form-actions"><Button variant="ghost">취소</Button><Button disabled={state === "error"}>관계자 저장</Button></div>
            </>}
          </div>
          <Field className="ds-layout-section"><FieldLabel htmlFor="layout-note">판단 메모</FieldLabel><Textarea id="layout-note" rows={4} defaultValue="반복 업무를 자동화하는 B2B 협업 서비스. 고객군별 활용 패턴과 반복 사용 흐름을 바탕으로 프로젝트 접점을 검토한다. 긴 설명도 입력칸과 같은 내용 너비 안에서 줄바꿈한다." /></Field>
        </div>
        <footer className="ds-layout-pane-footer"><Button variant="destructive">fit 부적합</Button><Button disabled>연락처 없음</Button><Button className="ds-approval" disabled={state !== "editing"}>승인</Button></footer>
      </div>
    </div>
    <p className="ds-layout-note">보기 영역보다 넓은 값은 영역 안에 맞춰집니다. 위 ‘실제 너비’를 기준으로 비교합니다. 점선은 내용 정렬을 확인하는 도구이며 실제 화면에는 표시하지 않습니다. 행동 버튼은 배치 예시입니다.</p>
    <h3 className="ds-subtitle-1 ds-layout-subhead">03. 너비별 동작 제안</h3>
    <div className="ds-layout-table-wrap"><table className="ds-layout-table"><thead><tr><th>대상</th><th>너비가 넓어질 때</th><th>좁아질 때</th></tr></thead><tbody>
      <tr><th>패널 내용</th><td>좌우 20px 유지 · 내용만 확장</td><td>좌우 20px 유지 · 글자 크기 유지</td></tr>
      <tr><th>관계자 입력 · 메모</th><td>같은 내용 너비 · 입력 2열</td><td>패널 620px 이하에서 입력 1열 · 메모는 전체 너비</td></tr>
      <tr><th>하단 행동</th><td>12px 간격 · 우측 정렬</td><td>간격 유지 · 넘치면 다음 줄 · 본문과 별도 영역</td></tr>
      <tr><th>목록 설명 · 필터</th><td>설명 최대 240px · 담당자와 같은 줄</td><td>설명 말줄임 · 목록 320px 이하에서 필터 다음 줄</td></tr>
      <tr><th>전체 화면</th><td>목록 · 작업 · 기업 정보 3칸</td><td>화면 900px 이하에서 한 칸씩 표시</td></tr>
    </tbody></table></div>
    <p className="ds-layout-note">620 / 320 / 900px과 설명 최대 240px은 기존 구현 기준을 가져온 초안입니다. 66px 헤더는 세 칸의 공통 높이로 유지합니다. 본문은 스크롤하고 하단 행동은 고정된 별도 영역에 둡니다. 업무 화면 적용 후 패널 최소 너비와 전환점을 검수해 확정합니다.</p>
  </section>;
}
