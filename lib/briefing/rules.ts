import type {
  Briefing,
  FeedbackInput,
  PainArea,
  RiskLevel,
} from './types';

/**
 * 규칙 기반 브리핑 생성 (순수 함수, I/O 없음).
 *
 * 원칙
 * - 회원이 보고한 사실만 사용한다. 진단·원인 추정 금지.
 * - 티칭 팁은 "제안"이다. 운동 변경 여부는 원장이 결정한다.
 * - Safe/Caution/Danger 는 의료 위험도가 아니라 "확인 우선순위" 표시다.
 * - 피드백이 없으면 '미응답'이며 수행하지 않았다고 단정하지 않는다.
 */

const RED_FLAG = /저림|저려|방사|마비|감각|붓|부었|열감/;
const DISCOMFORT = /찌릿|뻐근|당기|불편|아프|통증|걸림|찝|쑤시/;

interface AreaRule {
  avoid: string;
  mobility: string[];
}

const AREA_RULES: Record<PainArea, AreaRule> = {
  무릎: {
    avoid: '깊은 스쿼트·런지 (무릎 굴곡 부하 큰 구간)',
    mobility: ['발목 가동성 드릴', '둔근 활성화'],
  },
  허리: {
    avoid: '고부하 힙 힌지·윗몸 일으키기',
    mobility: ['흉추 가동성 스트레칭', '복압 호흡 + 골반 중립 확인'],
  },
  어깨: {
    avoid: '오버헤드 프레스·풀업',
    mobility: ['견갑 안정화 드릴', '흉추 신전 가동성'],
  },
  목: {
    avoid: '경추 굴곡을 유지하는 동작 (크런치 계열)',
    mobility: ['턱 당기기 (친 터크)', '상부 승모 이완'],
  },
  고관절: {
    avoid: '깊은 스쿼트·측면 런지',
    mobility: ['고관절 가동성 드릴', '둔근 활성화'],
  },
};

function unique<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items));
}

export function completionRate(feedback: FeedbackInput | null): number | null {
  if (!feedback) return null;
  const rate = Math.round(
    (feedback.completedSets / feedback.prescribedSets) * 100,
  );
  return Math.min(100, Math.max(0, rate));
}

export function assessRisk(feedback: FeedbackInput | null): {
  level: RiskLevel;
  reasons: string[];
} {
  if (!feedback) {
    return {
      level: 'Safe',
      reasons: ['최근 회원 응답이 없어 신호를 확인할 수 없어요'],
    };
  }

  const memo = feedback.voiceMemo ?? '';
  const rate = completionRate(feedback);
  const dangerReasons: string[] = [];
  const cautionReasons: string[] = [];

  if (feedback.painScore !== null && feedback.painScore >= 7) {
    dangerReasons.push(`통증 ${feedback.painScore}/10 보고`);
  }
  if (RED_FLAG.test(memo)) {
    dangerReasons.push('메모에 저림·방사 등 신경 증상 표현');
  }

  if (dangerReasons.length > 0) {
    return { level: 'Danger', reasons: dangerReasons };
  }

  if (feedback.painScore !== null && feedback.painScore >= 4) {
    cautionReasons.push(`통증 ${feedback.painScore}/10 보고`);
  }
  if (feedback.painAreas.length > 0) {
    cautionReasons.push(`${feedback.painAreas.join('·')} 불편 선택`);
  }
  if (feedback.feel === 'hurt') {
    cautionReasons.push('운동 후 느낌: 힘들었음');
  }
  if (DISCOMFORT.test(memo)) {
    cautionReasons.push('메모에 불편함 표현');
  }
  if (rate !== null && rate < 50) {
    cautionReasons.push(`숙제 수행 보고 ${rate}%`);
  }

  if (cautionReasons.length > 0) {
    return { level: 'Caution', reasons: unique(cautionReasons) };
  }

  return { level: 'Safe', reasons: ['특이 신호 보고 없음'] };
}

export function summarizeMemo(memo: string | null, max = 50): string | null {
  if (!memo) return null;
  const flat = memo.replace(/\s+/g, ' ').trim();
  if (flat.length === 0) return null;
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function buildModification(
  feedback: FeedbackInput | null,
  level: RiskLevel,
): Briefing['modification'] {
  const areas = feedback ? unique(feedback.painAreas) : [];
  const avoid = unique(areas.map((area) => AREA_RULES[area].avoid));
  const mobilityFirst = unique(
    areas.flatMap((area) => AREA_RULES[area].mobility),
  );

  let note: string;
  if (level === 'Danger') {
    note =
      '부하 동작 전에 증상 위치와 시작 시점을 먼저 확인해 주세요. 수업 범위 조정은 원장님이 판단해 주세요.';
  } else if (areas.length > 0) {
    note = '아래는 제안이에요. 실제 조정은 원장님이 판단해 주세요.';
  } else if (!feedback) {
    note = '회원 응답이 없어요. 수업 시작 때 컨디션을 먼저 물어봐 주세요.';
  } else {
    note = '특이 신호가 없어요. 계획대로 진행하되 워밍업 중 컨디션을 확인해 주세요.';
  }

  return { avoid, mobilityFirst, note };
}

export function buildOpeningLine(
  memberName: string,
  feedback: FeedbackInput | null,
): string {
  if (!feedback) {
    return `${memberName} 님, 지난 숙제는 어떠셨어요? 편하게 말씀해 주세요.`;
  }
  if (feedback.painAreas.length > 0) {
    const areas = unique(feedback.painAreas).join('·');
    return `${memberName} 님, 지난번 숙제 때 ${areas} 쪽이 불편하셨다고 하셨죠. 그 부분부터 먼저 체크해 드릴게요.`;
  }
  const rate = completionRate(feedback);
  if (rate !== null && rate >= 100) {
    return `${memberName} 님, 숙제를 끝까지 해내셨네요! 하시면서 어떠셨는지 먼저 들려주세요.`;
  }
  return `${memberName} 님, 숙제 하시느라 고생하셨어요. 하시면서 어렵거나 막히는 부분은 없으셨어요?`;
}

export interface BuildBriefingArgs {
  memberId: string;
  memberName: string;
  feedback: FeedbackInput | null;
  now: Date;
  source: Briefing['source'];
}

export function buildBriefing(args: BuildBriefingArgs): Briefing {
  const { memberId, memberName, feedback, now, source } = args;
  const { level, reasons } = assessRisk(feedback);
  const rate = completionRate(feedback);

  return {
    memberId,
    memberName,
    generatedAt: now.toISOString(),
    source,
    basedOnFeedbackAt: feedback?.submittedAt ?? null,
    risk: level,
    riskReasons: reasons,
    checkpoint: {
      completionRate: rate,
      completionLabel: feedback
        ? `${feedback.completedSets}/${feedback.prescribedSets}세트 보고 · ${rate ?? 0}%`
        : '미응답',
      painChips: feedback ? unique(feedback.painAreas) : [],
      painScore: feedback?.painScore ?? null,
      memoSummary: summarizeMemo(feedback?.voiceMemo ?? null),
    },
    modification: buildModification(feedback, level),
    mentalCare: { opening: buildOpeningLine(memberName, feedback) },
  };
}
