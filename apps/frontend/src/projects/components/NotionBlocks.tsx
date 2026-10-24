import type { ReactNode } from "react";
import type { RichTextSpan, WhitepaperBlock } from "../api";
import "./NotionBlocks.css";

// 백서 본문 렌더러. 서버가 Notion 블록을 줄여서 준 형태(WhitepaperBlock)를 그대로
// 그린다 — 백서 템플릿이 쓰는 블록(제목·문단·목록·콜아웃·표·열·이미지·토글)만
// 다루고, 모르는 블록은 건너뛴다.
export function NotionBlocks({ blocks }: { blocks: WhitepaperBlock[] }) {
  return <>{groupLists(blocks).map((group, i) => renderGroup(group, i))}</>;
}

type Group =
  | { list: "ul" | "ol"; items: WhitepaperBlock[] }
  | { block: WhitepaperBlock };

// Notion은 목록 항목이 각각 따로인 블록이라, 이어지는 항목을 하나의 <ul>/<ol>로 묶는다.
function groupLists(blocks: WhitepaperBlock[]): Group[] {
  const groups: Group[] = [];
  for (const block of blocks) {
    const list =
      block.type === "bulleted_list_item"
        ? "ul"
        : block.type === "numbered_list_item"
          ? "ol"
          : null;
    const last = groups[groups.length - 1];
    if (list && last && "list" in last && last.list === list) {
      last.items.push(block);
    } else if (list) {
      groups.push({ list, items: [block] });
    } else {
      groups.push({ block });
    }
  }
  return groups;
}

function renderGroup(group: Group, key: number) {
  if ("block" in group) return <Block key={key} block={group.block} />;
  const items = group.items.map((item, i) => (
    <li key={i}>
      <RichText spans={item.richText} />
      {item.children && <NotionBlocks blocks={item.children} />}
    </li>
  ));
  return group.list === "ul" ? (
    <ul key={key}>{items}</ul>
  ) : (
    <ol key={key}>{items}</ol>
  );
}

function Block({ block }: { block: WhitepaperBlock }) {
  const children = block.children && <NotionBlocks blocks={block.children} />;
  const text = <RichText spans={block.richText} />;

  switch (block.type) {
    case "heading_1":
      return withChildren(<h2>{text}</h2>, children);
    case "heading_2":
      return withChildren(<h3>{text}</h3>, children);
    case "heading_3":
      return withChildren(<h4>{text}</h4>, children);
    case "paragraph":
      return withChildren(<p>{text}</p>, children);
    case "quote":
      return (
        <blockquote>
          {text}
          {children}
        </blockquote>
      );
    case "to_do":
      return (
        <div className="notion-todo">
          <input type="checkbox" checked={Boolean(block.checked)} readOnly />
          <div>
            {text}
            {children}
          </div>
        </div>
      );
    case "toggle":
      return (
        <details className="notion-toggle">
          <summary>{text}</summary>
          {children}
        </details>
      );
    case "callout":
      return (
        <div className="notion-callout">
          {block.icon && (
            <span className="notion-callout-icon">{block.icon}</span>
          )}
          <div>
            {text}
            {children}
          </div>
        </div>
      );
    case "code":
      return (
        <pre className="notion-code">
          <code>{block.richText?.map((s) => s.text).join("")}</code>
        </pre>
      );
    case "divider":
      return <hr />;
    case "image":
      return block.url ? (
        <figure className="notion-image">
          <img src={block.url} alt={plain(block.caption)} loading="lazy" />
          {block.caption && block.caption.length > 0 && (
            <figcaption>
              <RichText spans={block.caption} />
            </figcaption>
          )}
        </figure>
      ) : null;
    case "table":
      return <Table block={block} />;
    case "column_list":
      return (
        <div className="notion-columns">
          {block.columns?.map((column, i) => (
            <div key={i} className="notion-column">
              <NotionBlocks blocks={column} />
            </div>
          ))}
        </div>
      );
    case "child_page":
    case "child_database":
      // 하위 페이지·인라인 DB(관련 인사이트 등)는 원본 Notion에서만 볼 수 있다.
      return (
        <p className="notion-muted">
          {block.type === "child_page" ? "📄" : "🗂️"}{" "}
          {block.title || "제목 없음"} (Notion 원본에서 확인)
        </p>
      );
    default:
      // bookmark·embed·file·pdf·video
      return block.url ? (
        <p>
          <a href={block.url} target="_blank" rel="noreferrer">
            {plain(block.caption) || block.url}
          </a>
        </p>
      ) : null;
  }
}

function withChildren(node: ReactNode, children: ReactNode) {
  if (!children) return node;
  return (
    <>
      {node}
      <div className="notion-indent">{children}</div>
    </>
  );
}

function Table({ block }: { block: WhitepaperBlock }) {
  const rows = block.rows ?? [];
  if (rows.length === 0) return null;
  const [head, ...body] = block.hasColumnHeader ? rows : [null, ...rows];
  return (
    <div className="notion-table-wrap">
      <table className="notion-table">
        {head && (
          <thead>
            <tr>
              {head.map((cell, i) => (
                <th key={i}>
                  <RichText spans={cell} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {row?.map((cell, c) => (
                <td key={c}>
                  <RichText spans={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RichText({ spans }: { spans?: RichTextSpan[] }) {
  if (!spans || spans.length === 0) return null;
  return (
    <>
      {spans.map((span, i) => {
        let node: ReactNode = span.text;
        if (span.code) node = <code>{node}</code>;
        if (span.bold) node = <strong>{node}</strong>;
        if (span.italic) node = <em>{node}</em>;
        if (span.strikethrough) node = <s>{node}</s>;
        if (span.underline) node = <u>{node}</u>;
        if (span.href) {
          node = (
            <a href={notionHref(span.href)} target="_blank" rel="noreferrer">
              {node}
            </a>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

// 페이지 멘션은 "/<pageId>"처럼 Notion 안쪽 경로로 온다.
function notionHref(href: string) {
  return href.startsWith("/") ? `https://www.notion.so${href}` : href;
}

function plain(spans?: RichTextSpan[]) {
  return spans?.map((s) => s.text).join("") ?? "";
}
