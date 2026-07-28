import { createContext, useContext, useEffect } from "react";
import { STORE_NAME } from "./config";

const TitleContext = createContext(() => {});

export function usePageTitle(title) {
  const setTitle = useContext(TitleContext);
  useEffect(() => {
    setTitle(title);
    document.title = `${STORE_NAME} — ${title}`;
  }, [title, setTitle]);
}

export default TitleContext;
