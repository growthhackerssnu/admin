-- 잘못 누른 발송 완료를 취소한 기록을 수주 결과 변경 이력에 남긴다. 기존 데이터는 바꾸지 않는다.

-- AlterEnum
ALTER TYPE "dh"."OutcomeEventSource" ADD VALUE 'send_cancel';
