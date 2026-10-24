import type { PublicBlock } from "../api";
import "./NotionBlocks.css";

// 홈페이지 공개 소개 본문(서버에 저장된 복사본) 렌더러. 백서 렌더러와 같은 글꼴·간격
// (.notion-body)을 쓴다. 이어지는 목록 줄은 하나의 <ul>로 묶는다.
export function PublicBlocks({ blocks }: { blocks: PublicBlock[] }) {
  const groups: (PublicBlock | PublicBlock[])[] = [];
  for (const block of blocks) {
    const last = groups[groups.length - 1];
    const isList = block.type === "text" && block.list && !block.quote;
    if (isList && Array.isArray(last)) last.push(block);
    else groups.push(isList ? [block] : block);
  }

  return (
    <>
      {groups.map((group, i) =>
        Array.isArray(group) ? (
          <ul key={i}>
            {group.map((item, j) => (
              <li key={j}>{item.type === "text" ? item.text : null}</li>
            ))}
          </ul>
        ) : (
          <Block key={i} block={group} />
        ),
      )}
    </>
  );
}

function Block({ block }: { block: PublicBlock }) {
  switch (block.type) {
    case "heading":
      return <h2>{block.text}</h2>;
    case "image":
      return (
        <figure className="notion-image">
          <img src={block.url} alt="" loading="lazy" />
        </figure>
      );
    case "text":
      if (block.quote) return <blockquote>{block.text}</blockquote>;
      return <p>{block.bold ? <strong>{block.text}</strong> : block.text}</p>;
  }
}
