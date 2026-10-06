import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPeople, type PersonSummary } from "../hr/lib/api";
import { supabase } from "./supabase";

// 사이트 어디서든 학회원 이름을 그핵드인 프로필(/hr/people/:id)로 잇는다.
// 그핵드인 디렉토리를 한 번만 받아 이름(공백 무시)·기수로 찾고, 한 사람으로 정해지지 않으면 글자만 보인다.
let directory: Promise<Map<string, PersonSummary[]>> | null = null;

const key = (name: string) => name.replace(/\s+/g, "");

function loadDirectory() {
  directory ??= supabase.auth
    .getSession()
    .then(({ data }) => getPeople(data.session?.access_token ?? ""))
    .then((people) => {
      const byName = new Map<string, PersonSummary[]>();
      people.forEach((person) =>
        byName.set(key(person.name), [
          ...(byName.get(key(person.name)) ?? []),
          person,
        ]),
      );
      return byName;
    })
    .catch(() => {
      directory = null; // 다음 화면에서 다시 시도한다.
      return new Map();
    });
  return directory;
}

export function PersonLink({
  name,
  cohort,
}: {
  name: string;
  // "19기"·19 모두 받는다. 없으면 이름만으로 찾는다.
  cohort?: string | number | null;
}) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const wanted = cohort == null ? null : parseInt(String(cohort), 10);
    void loadDirectory().then((byName) => {
      const matches = (byName.get(key(name)) ?? []).filter(
        (person) =>
          wanted == null || Number.isNaN(wanted) || person.cohort === wanted,
      );
      if (alive) setId(matches.length === 1 ? matches[0]!.notionPageId : null);
    });
    return () => {
      alive = false;
    };
  }, [name, cohort]);

  if (!id) return <>{name}</>;
  return (
    <Link
      className="person-link"
      to={`/hr/people/${id}`}
      title={`${name} 그핵드인 프로필`}
    >
      {name}
    </Link>
  );
}
