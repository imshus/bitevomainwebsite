// The menu and site settings, fetched once per visit and shared by every page.
import { useEffect, useState } from 'react';
import { api } from '../api.js';

function cached(fetcher) {
  let promise = null;
  let latest = null; // the last answer, so components mounted later have it on their first render
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
        error => live && setState({ data: null, error, loading: false }),
      );
      return () => { live = false; };
    }, []);
    return { ...state, reload: () => load(true).then(data => setState({ data, error: null, loading: false })) };
  };
  return [load, useIt];
}

export const [loadMenu, useMenu] = cached(api.menu);
export const [loadConfig, useConfig] = cached(api.config);
