const width = 1536, height = 1024;
const x = (value: number) => `${value / width * 100}%`;
const y = (value: number) => `${value / height * 100}%`;

/** Physical anchors measured from the approved native Learning Studio artboard.
 * The background and every foreground object share one uniform camera. */
export function studioSceneProperties(): Record<string, string> {
  return {
    '--studio-pair-x': x(207), '--studio-pair-y': y(343), '--studio-pair-width': x(543),
    '--studio-roles-x': x(178), '--studio-roles-y': y(777), '--studio-roles-width': x(722),
    '--studio-learn-x': x(138), '--studio-practice-x': x(311), '--studio-feedback-x': x(720), '--studio-progress-x': x(879),
    '--studio-stage-y': y(580), '--studio-stage-art': x(145), '--studio-stage-width': x(160),
    '--studio-role-art': x(100), '--studio-crop-y': y(343),
  };
}
