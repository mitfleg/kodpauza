'use client';

import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { reachMetrikaGoal, type MetrikaGoal } from '@/lib/metrika';

type MetrikaGoalLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  goal: MetrikaGoal;
};

export function MetrikaGoalLink({ goal, onClick, ...props }: MetrikaGoalLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    reachMetrikaGoal(goal);
    onClick?.(event);
  }

  return <a {...props} onClick={handleClick} />;
}
