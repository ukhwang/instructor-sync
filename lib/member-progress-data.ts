import { createProgressGoalAction, getMemberProgressAction, recordProgressObservationAction } from '@/app/actions/data';
import type { ActionResult } from './action-result';
import { MemberProgressGoalInput, MemberProgressObservationInput, MemberProgressResult } from './member-progress-types';

function transportFailure(reason: string): MemberProgressResult {
  return { success: false, retryable: true, reason };
}

/**
 * A confirmed server rejection ({ success: false, reason }) is returned as-is.
 * A lost/unknown outcome is marked retryable; the same request_id makes the
 * retry idempotent on the server.
 */
async function safely(action: () => Promise<ActionResult<MemberProgressResult>>): Promise<MemberProgressResult> {
  try {
    const result = await action();
    if (!result.ok) return transportFailure(result.code === 'AUTH_REQUIRED' ? 'unauthorized' : 'rpc_failed');
    return result.data ? result.data : transportFailure('empty_rpc_response');
  } catch {
    return transportFailure('network_error');
  }
}

export async function createMemberProgressGoal(input: MemberProgressGoalInput): Promise<MemberProgressResult> {
  return safely(() => createProgressGoalAction(input));
}

export async function recordMemberProgressObservation(input: MemberProgressObservationInput): Promise<MemberProgressResult> {
  return safely(() => recordProgressObservationAction(input));
}

export async function getMemberProgress(memberId: string): Promise<MemberProgressResult> {
  return safely(() => getMemberProgressAction(memberId));
}
