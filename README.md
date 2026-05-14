# 팔팔너구리해장 월결산 웹앱

식당 손익 확인용 월결산 웹앱입니다.

복식부기, 차변/대변, 전표 시스템이 아니라 **매장 운영 손익 확인**에 맞춘 구조입니다.

## 기능

- 자금일보: 자금현황, 금일 출금완료, 출금예정 직접 입력/수정/삭제
- 출금예정 입력 시 합계, 예상잔액, 미지급 거래처 요약 자동 계산
- 자금일보는 월결산 손익과 별도 저장

- 공용 비밀번호 접속
- 거래 입력
- 자동 저장
- 거래 목록 수정/삭제
- 계정과목 관리
- 월별 손익 집계
- 원가율/인건비율/순이익률 자동 계산
- Excel 다운로드
- PDF 출력
- 비손익거래 분리
- 월결산 분석: 문제점, 개선 방향, 다음달 실행 기준 자동 출력
- 보고용 월간 손익 보고서 출력: 핵심 요약, 매출/비용 현황, 주요 비용률, 전월 비교, 비손익거래 정리

## 기술 스택

- Next.js
- Supabase PostgreSQL
- Vercel
- SheetJS xlsx

## 설치

```bash
npm install
npm run dev
```

## Supabase 세팅

1. Supabase 프로젝트 생성
2. SQL Editor 열기
3. `supabase/schema.sql` 전체 복사 후 실행
4. Project Settings > API에서 아래 값 확인
   - Project URL
   - service_role key

## 환경변수

`.env.example`을 `.env.local`로 복사 후 입력합니다.

```bash
cp .env.example .env.local
```

필수 값:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_PASSWORD=
SESSION_SECRET=
```

주의:

`SUPABASE_SERVICE_ROLE_KEY`는 절대 `NEXT_PUBLIC_`을 붙이면 안 됩니다.

## 배포

Vercel에 올린 뒤 Environment Variables에 위 환경변수를 그대로 등록하면 됩니다.

## 손익 계산 기준

```text
총매출 = 홀매출 + 배달매출 + 기타매출
손익비용 = 매출원가 + 인건비 + 고정비 + 변동비 + 운영비 + 기타비용
순이익 = 총매출 - 손익비용
비손익거래 = 순이익 계산에서 제외
```

비용 제외 항목:

- 물류보증금 반환
- 가맹보증금 반환
- 부가세 납부
- 대출원금 상환
- 대표자 인출

비용 포함 항목:

- 식자재비
- 인건비
- 임차료
- 배달앱 수수료
- 카드수수료
- 광고비
- 대출 이자
- 소모품비


## 자금일보 추가 SQL

기존 앱에 자금일보 메뉴를 추가할 때는 Supabase SQL Editor에서 아래 파일을 1번 실행하세요.

```text
supabase/cash_daily_items_migration.sql
```


## v9 자금일보 개선

- 자금현황은 고정 계좌 기준으로 잔액 숫자만 입력
- 금일 출금완료와 출금예정은 엑셀형 셀 입력 후 한 번에 저장
- 자금일보는 월결산 손익과 별도 저장
