/**
 * Exercise Homework (운동숙제) — Copy Constants & Tone of Voice
 * 
 * 원칙:
 * 1. 강사가 회원에게 직접 말하는 담백한 구어체
 * 2. 마케팅 문구, AI 배지, 이모지 남발 금지
 * 3. 완료와 못 함을 동일한 위계로 존중
 * 4. 쓸 것: 인용, 패스 확인, 다음 수업에서 이어갈 기록
 * 5. 버릴 것: 대단하세요, 달성률 %, 다른 회원은, 오늘만 할인, 의지, 바디코디 대체
 */

export const COPY = {
  BRAND_NAME: '운동숙제',
  TAGLINE: '수업과 수업 사이, 회원의 몸을 이어주는 기록',
  SUB_TAGLINE: 'CRM이 아닙니다. 수업 사이 회원이 관리받고 있음을 체감하게 만드는 최소 루프입니다.',

  // 회원 링크 페이지 (/h/[token])
  MEMBER: {
    TITLE_SUFFIX: '님의 이번 주 운동숙제',
    WHY_HEADING: '이번 숙제를 드리는 이유',
    EXERCISE_LIST_HEADING: '수업 때 맞춘 동작 1~3가지',
    ACTION_QUESTION: '동작을 해보셨나요?',
    VOICE_COACH_START: '음성 코치로 시작하기',
    BTN_COMPLETE: '완료했습니다',
    BTN_CANT: '못 했습니다',
    PAIN_CHECK_LABEL: '동작 중 통증이나 불편한 느낌이 있었나요?',
    FEEDBACK_PLACEHOLDER: '예: 2세트 때 허리가 뻐근했어요 / 바빠서 1세트만 겨우 했어요',
    SUBMIT_BTN: '기록 남기기',
    SUBMIT_SUCCESS_TITLE: '기록이 전달되었습니다',
    RECORD_CONTINUATION: '기록은 이 라인에서 이어집니다. 다음 수업 때 강사님이 이 기록부터 확인합니다.',
    EXPIRED_TITLE: '만료된 숙제 링크입니다',
    EXPIRED_DESC: '유효기간(14일)이 지났습니다. 강사님께 다음 숙제 링크를 요청해주세요.',
    REVOKED_TITLE: '종료된 숙제 링크입니다',
    REVOKED_DESC: '강사님에 의해 무효화된 링크입니다. 새로운 링크를 문의해주세요.',
    NOT_FOUND_TITLE: '유효하지 않은 링크입니다',
    NOT_FOUND_DESC: '링크 주소를 다시 확인해주세요.',
  },

  // 카카오톡 공유 문구 템플릿
  KAKAO: {
    generateMessage: (memberName: string, why: string, url: string) => {
      return `${memberName}님, 오늘 수업 고생하셨습니다.\n\n이번 주 숙제 전달드립니다:\n"${why}"\n\n아래 링크에서 동작 확인하시고, 수업 전까지 편하게 기록 한 줄 남겨주세요.\n(로그인 없이 제출됩니다)\n\n링크: ${url}`;
    },
  },

  // 다음 수업 준비 (/app/session/[memberId])
  SESSION_ALERT: {
    OPENING_HEADING: '오늘 수업 오프닝 멘트',
    OPENING_SUBTITLE: '수업 시작 1분 전, 아래 문장을 그대로 읽으시면 됩니다.',
    TARGET_END_STATE: '회원 목표',
    MEMBER_RAW_QUOTE: '회원 제출 원문',
    SESSION_NOTE_HEADING: '오늘 수업 메모',
    SESSION_NOTE_PLACEHOLDER: '오늘 수업에서 발견한 점이나 다음 숙제에 반영할 포인트를 적어두세요.',
    SAVE_NOTE_BTN: '메모 저장',
    PRO_LOCK_MSG: 'Pro 플랜에서 맞춤 수업 준비 내용과 인용 멘트가 잠금 해제됩니다.',
    UNLOCK_PRO_BTN: 'Pro 플랜 전환하기',
  },

  // 재등록 상담 카드 (/app/renewals)
  RENEWALS: {
    PAGE_TITLE: '재등록 상담 준비',
    PAGE_DESC: '잔여 4회 이하 회원과 다음 수업에서 나눌 대화를 준비합니다.',
    CTA_OPEN_SCRIPT: '상담 문장 보기',
    PRO_LOCK_BANNER: 'Free 플랜은 첫 번째 카드만 열람 가능합니다. 전체 카드는 Pro 플랜에서 확인하세요.',
  },

  // 강사 플랜 게이트
  PLAN: {
    FREE_MEMBER_LIMIT_MSG: 'Free 플랜은 최대 5명까지 등록 가능합니다.',
    UPGRADE_TO_PRO: 'Pro 활성화',
    CURRENT_FREE: 'Free 플랜 (최대 5명)',
    CURRENT_PRO: 'Pro 플랜 (무제한)',
  }
} as const;
