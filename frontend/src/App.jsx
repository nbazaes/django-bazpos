import { useEffect, useState } from "react";
import { isLoggedIn, saveUser } from "./lib/auth";
import { me } from "./lib/api";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";

function App() {
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (loggedIn) {
      me()
        .then((userData) => {
          saveUser(userData);
          setUser(userData);
        })
        .catch(() => {
          setLoggedIn(false);
        });
    }
  }, [loggedIn]);

  if (!loggedIn) {
    return <LoginPage />;
  }

  return <DashboardPage user={user} />;
}

export default App;
