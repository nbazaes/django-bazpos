import { createContext, useContext, useEffect } from "react";
import { useStoreName } from "./storeConfig";

const TitleContext = createContext(() => {});

export function usePageTitle(title) {
  const setTitle = useContext(TitleContext);
  const storeName = useStoreName();
  useEffect(() => {
    setTitle(title);
    document.title = `${storeName} — ${title}`;
  }, [title, setTitle, storeName]);
}

export default TitleContext;
