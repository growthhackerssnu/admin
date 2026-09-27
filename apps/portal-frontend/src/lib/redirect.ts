// gateway는 production에서 /dh, /hr을 같은 origin 아래로 rewrite하므로 상대
// 경로면 충분하다. 로컬은 앱마다 포트가 달라서, 있으면 절대 URL로 덮어쓴다.
// Login.tsx와 Index.tsx 둘 다 "role별 목적지로 이동"을 하므로 여기 하나로 모았다.
export function resolveRedirect(path: string): string {
  if (path === "/dh" && import.meta.env.VITE_DH_URL)
    return import.meta.env.VITE_DH_URL;
  if (path === "/hr" && import.meta.env.VITE_HR_URL)
    return import.meta.env.VITE_HR_URL;
  return path;
}
