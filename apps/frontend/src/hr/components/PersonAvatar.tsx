import { useState } from "react";
import { UserOutlined } from "@ant-design/icons";
import "./PersonAvatar.css";

// 프로필 사진(정사각). 두 가지를 한다:
//  1) 사진이 없거나(null) 불러오기에 실패하면 기본 프로필(회색 실루엣)을 그린다.
//     — 아직 사진을 안 찍은 신입도 목록에 자연스럽게 나오게 하려는 것. 기본 이미지를
//     캐시에 URL로 넣지 않고 화면에서 그리는 이유: "사진 없음"과 "사진 있음"이 캐시
//     값으로 구분되고(null), 기본 이미지 디자인을 바꿔도 캐시를 다시 만들 필요가 없다.
//  2) loading="lazy": 디렉토리는 수백 장을 한꺼번에 그리는데, 화면 밖 사진까지 처음에
//     전부 내려받으면(약 40KB × 270장) 첫 로딩이 느려진다. 화면에 가까워질 때 받는다.
export function PersonAvatar({ src, size }: { src: string | null; size: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (!src || failed) {
    return (
      <span className="person-avatar person-avatar-default" style={style} aria-hidden="true">
        <UserOutlined style={{ fontSize: Math.round(size * 0.5) }} />
      </span>
    );
  }

  return (
    <img
      className="person-avatar"
      style={style}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
