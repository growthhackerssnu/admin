import { useEffect, useRef, useState } from "react";
import { Alert, App as AntApp, Checkbox, Progress as AntProgress } from "antd";
import { AppButton as Button } from "@/components/ui/app-button";
import {
  canUseFolders,
  ensurePermission,
  fsFolder,
  pickFolder,
  type Folder,
} from "./folder";
import { runExport, type Progress } from "./exporter";
import { DEFAULT_FILE_OPTIONS, type FileKind, type FileOptions } from "./files";
import { AUTH_ERRORS, createSlackClient, SlackError } from "./slackClient";
import { downloadSlackFile, type SlackSession } from "./api";
import { signInWithSlack } from "./oauth";
import { conversationLabel, loadExport, type ExportData } from "./viewer/data";
import { Viewer } from "./viewer/Viewer";
import "./slack.css";

// /slack — 내 슬랙 메시지를 내 컴퓨터 폴더에 백업하고 읽기 전용으로 본다.
// 슬랙 토큰은 이 화면 메모리에만 있다(새로고침하면 다시 로그인).
export default function SlackPage() {
  const { message } = AntApp.useApp();
  const [session, setSession] = useState<SlackSession>();
  const [handle, setHandle] = useState<FileSystemDirectoryHandle>();
  const [folder, setFolder] = useState<Folder>();
  const [data, setData] = useState<ExportData | null>();
  const [progress, setProgress] = useState<Progress>();
  const [waiting, setWaiting] = useState(0);
  const [error, setError] = useState<string>();
  const [signingIn, setSigningIn] = useState(false);
  const [running, setRunning] = useState(false);
  const [fileOptions, setFileOptions] =
    useState<FileOptions>(DEFAULT_FILE_OPTIONS);
  const abort = useRef<AbortController>();

  const reload = async (target = folder) =>
    target && setData(await loadExport(target));
  useEffect(() => () => abort.current?.abort(), []);

  if (!canUseFolders())
    return (
      <div className="slk-page">
        <Alert
          type="warning"
          showIcon
          message="이 브라우저는 폴더 저장을 지원하지 않습니다."
          description="크롬·엣지·웨일·아크 같은 크롬 계열 브라우저의 데스크톱 버전에서 열어 주세요."
        />
      </div>
    );

  async function signIn() {
    setSigningIn(true);
    setError(undefined);
    try {
      setSession(await signInWithSlack());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigningIn(false);
    }
  }

  async function openFolder() {
    try {
      const next = await pickFolder();
      const nextFolder = fsFolder(next);
      setHandle(next);
      setFolder(nextFolder);
      setError(undefined);
      const loaded = await loadExport(nextFolder);
      setData(loaded);
      // 이 폴더에서 쓰던 설정을 그대로 보여준다.
      setFileOptions(loaded?.manifest.fileOptions ?? DEFAULT_FILE_OPTIONS);
    } catch (e) {
      if ((e as DOMException).name !== "AbortError")
        setError("폴더를 열지 못했습니다.");
    }
  }

  async function start(full: boolean) {
    if (!session || !folder || !handle) return;
    if (!(await ensurePermission(handle)))
      return setError("폴더에 쓸 권한이 없습니다. 폴더를 다시 열어 주세요.");
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError(undefined);
    try {
      await runExport({
        client: createSlackClient(session.token, { onWait: setWaiting }),
        folder,
        download: (url) => downloadSlackFile(url, session.token),
        full,
        fileOptions,
        signal: controller.signal,
        // 백업 중에는 폴더를 열 때 읽은 내용을 그대로 보여주고, 끝나면 다시 읽는다.
        onProgress: setProgress,
      });
      message.success("백업을 마쳤습니다.");
    } catch (e) {
      if (e instanceof SlackError && AUTH_ERRORS.has(e.code)) {
        setSession(undefined);
        setError(
          "슬랙 로그인이 만료되었습니다. 다시 로그인한 뒤 이어서 백업하세요. 받은 데이터는 저장되어 있습니다.",
        );
      } else if ((e as DOMException).name === "AbortError") {
        message.info("백업을 멈췄습니다. 다음에 이어서 할 수 있습니다.");
      } else if ((e as DOMException).name === "NotAllowedError") {
        setError("폴더 권한이 풀렸습니다. 폴더를 다시 열어 주세요.");
      } else {
        setError(
          `백업 중 오류: ${e instanceof Error ? e.message : String(e)}. 다시 누르면 이어서 합니다.`,
        );
      }
    } finally {
      abort.current = undefined;
      setRunning(false);
      setProgress(undefined);
      setWaiting(0);
      await reload();
    }
  }

  const toggle = (key: FileKind | "compressPhotos", value: boolean) =>
    setFileOptions((current) => ({ ...current, [key]: value }));

  const manifest = data?.manifest;
  // 탈퇴한 계정·지운 앱과의 DM은 슬랙이 channel_not_found로 막는다. 받을 방법도 없고
  // 중요한 대화도 아니라 알리지 않는다. 그 밖의 실패만 이름으로 보여준다.
  const failed = manifest
    ? data!.conversations.filter((c) => {
        const error = manifest.conversations[c.id]?.error;
        return (
          error && !(error === "channel_not_found" && (c.is_im || c.is_mpim))
        );
      })
    : [];
  const exportButtons = !manifest ? (
    <Button
      type="primary"
      disabled={!session || running}
      onClick={() => start(false)}
    >
      백업 시작
    </Button>
  ) : manifest.finishedAt === null ? (
    <Button
      type="primary"
      disabled={!session || running}
      onClick={() => start(false)}
    >
      이어서 백업
    </Button>
  ) : (
    <>
      <Button
        type="primary"
        disabled={!session || running}
        onClick={() => start(false)}
      >
        새 메시지 받기
      </Button>
      <Button
        disabled={!session || running}
        onClick={() => start(true)}
        title="30일 넘은 스레드의 새 답글까지 받으려면 전체를 다시 받습니다."
      >
        전체 다시 받기
      </Button>
    </>
  );

  return (
    <div className="slk-page">
      <div className="slk-toolbar">
        <div className="slk-step">
          <span className="slk-muted">슬랙</span>
          {session ? (
            <b>{session.teamName} 로그인됨</b>
          ) : (
            <Button loading={signingIn} onClick={signIn}>
              슬랙으로 로그인
            </Button>
          )}
        </div>
        <div className="slk-step">
          <span className="slk-muted">폴더</span>
          {handle && <b>{handle.name}</b>}
          <Button disabled={running} onClick={openFolder}>
            {handle ? "다른 폴더" : "폴더 열기"}
          </Button>
        </div>
        {folder && <div className="slk-step">{exportButtons}</div>}
        {manifest && (
          <span className="slk-muted">
            {manifest.finishedAt
              ? `마지막 백업 ${new Date(manifest.finishedAt).toLocaleString("ko-KR")}`
              : "백업이 끝나지 않았습니다"}
          </span>
        )}
      </div>

      {folder && (
        <div className="slk-toolbar slk-options">
          <span className="slk-muted">받을 파일</span>
          {(
            [
              ["photos", "사진"],
              ["videos", "동영상"],
              ["files", "파일"],
            ] as const
          ).map(([key, label]) => (
            <Checkbox
              key={key}
              checked={fileOptions[key]}
              disabled={running}
              onChange={(e) => toggle(key, e.target.checked)}
            >
              {label}
            </Checkbox>
          ))}
          <Checkbox
            checked={fileOptions.photos && fileOptions.compressPhotos}
            disabled={running || !fileOptions.photos}
            onChange={(e) => toggle("compressPhotos", e.target.checked)}
          >
            사진 압축 <span className="slk-muted">(WebP, 최대 2048px)</span>
          </Checkbox>
          <span className="slk-muted">
            빼거나 다시 넣은 파일 종류는 이후에 받는 메시지부터 적용됩니다.
          </span>
        </div>
      )}

      {error && (
        <Alert
          type="error"
          showIcon
          closable
          message={error}
          onClose={() => setError(undefined)}
        />
      )}

      {running && progress && (
        <div className="slk-progress">
          <AntProgress
            percent={
              progress.total
                ? Math.round((progress.index / progress.total) * 100)
                : 0
            }
            size="small"
          />
          <span>
            {progress.phase === "meta"
              ? progress.name
              : `${progress.index}/${progress.total} ${progress.name}`}{" "}
            · 메시지 {progress.messages.toLocaleString()}개
            {waiting > 0 && ` · 슬랙 요청 한도로 ${waiting}초 기다리는 중`}
          </span>
          <Button onClick={() => abort.current?.abort()}>멈추기</Button>
        </div>
      )}

      {!!failed.length && !running && (
        <Alert
          type="warning"
          showIcon
          message={`받지 못한 대화 ${failed.length}개`}
          description={failed
            .map(
              (c) =>
                `${conversationLabel(data!, c)} (${manifest!.conversations[c.id].error})`,
            )
            .join(", ")}
        />
      )}

      {!folder ? (
        <div className="slk-empty">
          <h2>슬랙 백업</h2>
          <p>
            내가 볼 수 있는 모든 채널·비공개 채널·DM의 메시지, 스레드, 파일을 내
            컴퓨터 폴더에 저장하고 여기서 읽기 전용으로 봅니다. 데이터는 서버에
            저장되지 않습니다.
          </p>
          <ol>
            <li>슬랙으로 로그인</li>
            <li>
              새 백업이면 빈 폴더를, 이어서 하거나 보려면 예전 백업 폴더를
              엽니다
            </li>
            <li>
              백업 시작 — 다시 열면 끊긴 곳부터 이어서 하거나 새 메시지만
              받습니다
            </li>
          </ol>
        </div>
      ) : data ? (
        <Viewer data={data} />
      ) : (
        <div className="slk-empty">
          <p>
            이 폴더에는 백업이 없습니다. 슬랙으로 로그인한 뒤 백업 시작을
            누르세요.
          </p>
        </div>
      )}
    </div>
  );
}
