import { useEffect, useState } from 'react';
import { listen } from '../services/firebase';

export function useFirebaseValue<T>(path: string, initialValue: T): [T, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    return listen<T>(path, (next) => {
      setValue((next ?? initialValue) as T);
      setLoading(false);
    });
  }, [path]);

  return [value, loading];
}
