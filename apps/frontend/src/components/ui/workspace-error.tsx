import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./alert";
import { Button } from "./button";
import "./workspace-data.css";

export function WorkspaceError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Alert variant="destructive" className="ds-workspace-error">
      <CircleAlert />
      <AlertTitle>{message}</AlertTitle>
      {onRetry && (
        <AlertDescription>
          <Button size="sm" variant="outline" onClick={onRetry}>
            다시 불러오기
          </Button>
        </AlertDescription>
      )}
    </Alert>
  );
}
