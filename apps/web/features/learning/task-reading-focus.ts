export type TaskReadingFocusIntent = { scope: string };
export type TaskReadingFocusState = { open: boolean; permitted: boolean; failed: boolean; ready: boolean; newerFocus: boolean; openerConnected: boolean; activeIsOpener: boolean; activeIsNeutral: boolean; headingAvailable: boolean };
export function taskReadingFocusState(intent: TaskReadingFocusIntent | null, scope: string, state: TaskReadingFocusState): 'cancel' | 'wait' | 'focus' {
 if(!intent||intent.scope!==scope||!state.open||!state.permitted||state.failed||state.newerFocus||!state.activeIsOpener&&(!state.activeIsNeutral||state.openerConnected))return 'cancel';
 return state.ready&&state.headingAvailable?'focus':'wait';
}
