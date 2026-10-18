import { useEffect } from 'react';

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — BiteVo` : 'BiteVo — Good Food, Better Mood';
  }, [title]);
}
