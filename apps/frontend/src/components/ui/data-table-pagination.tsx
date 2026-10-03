import { Button } from "./button";
import { Pagination, PaginationContent, PaginationItem } from "./pagination";
import "./workspace-data.css";

/** No page numbers: compatible with both offset pages and server cursors. */
export function DataTablePagination({
  summary,
  canPrevious,
  canNext,
  pending = false,
  onPrevious,
  onNext,
}: {
  summary: string;
  canPrevious: boolean;
  canNext: boolean;
  pending?: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <footer className="ds-data-pagination">
      <span aria-live="polite">{summary}</span>
      <Pagination aria-label="목록 페이지 이동">
        <PaginationContent>
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !canPrevious}
              onClick={onPrevious}
            >
              이전
            </Button>
          </PaginationItem>
          <PaginationItem>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || !canNext}
              onClick={onNext}
            >
              다음
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </footer>
  );
}
