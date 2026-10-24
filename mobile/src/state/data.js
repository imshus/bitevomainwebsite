// The menu and site settings, fetched once per launch and shared by every screen (as on the website).
import { useEffect, useState } from 'react';
import { api } from '../api';

function cached(fetcher) {
  let promise = null;
  let latest = null; // the last answer, so screens opened later have it on their first render
  const load = (force = false) => {
    if (!promise || force) promise = fetcher().then(data => (latest = data)).catch(err => { promise = null; throw err; });
    return promise;
  };
  const useIt = () => {
    const [state, setState] = useState(() => ({ data: latest, error: null, loading: !latest }));
    useEffect(() => {
      let live = true;
      load().then(
        data => live && setState({ data, error: null, loading: false }),
        error => live && setState(s => ({ data: s.data, error, loading: false })),
      );
      return () => { live = false; };
    }, []);
    const reload = () => {
      setState(s => ({ ...s, loading: true }));
      return load(true).then(
        data => setState({ data, error: null, loading: false }),
        error => setState(s => ({ data: s.data, error, loading: false })),
      );
    };
    return { ...state, reload };
  };
  return [load, useIt];
}

export const [loadMenu, useMenu] = cached(api.menu);
export const [loadConfig, useConfig] = cached(api.config);
