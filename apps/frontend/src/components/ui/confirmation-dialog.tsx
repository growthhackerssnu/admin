import { useCallback, useEffect, useRef, useState } from "react";
import { AlertDialog } from "radix-ui";
import { Button } from "./button";

/** Shared dialog for discarding edits and recording externally completed work. */
export function useConfirmation() {
  const [prompt, setPrompt] = useState<{
    title: string;
    description: string;
    action: string;
  } | null>(null);
  const resolve = useRef<((value: boolean) => void) | null>(null);
  useEffect(
    () => () => {
      resolve.current?.(false);
      resolve.current = null;
    },
    [],
  );
  const confirm = useCallback(
    (description: string, title = "변경 확인", action = "계속") =>
      new Promise<boolean>((done) => {
        resolve.current?.(false);
        resolve.current = done;
        setPrompt({ title, description, action });
      }),
    [],
  );
  const finish = (value: boolean) => {
    resolve.current?.(value);
    resolve.current = null;
    setPrompt(null);
  };
  const dialog = (
    <AlertDialog.Root
      open={Boolean(prompt)}
      onOpenChange={(open) => {
        if (!open) finish(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <AlertDialog.Content className="ds-workspace fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-background p-6 text-foreground shadow-lg">
          <AlertDialog.Title className="text-base font-semibold">
            {prompt?.title}
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm leading-relaxed text-muted-foreground">
            {prompt?.description}
          </AlertDialog.Description>
          <div className="flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" onClick={() => finish(false)}>
                취소
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button onClick={() => finish(true)}>{prompt?.action}</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
  return { confirm, dialog };
}
