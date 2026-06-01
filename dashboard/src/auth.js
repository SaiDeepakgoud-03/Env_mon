import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool
} from "amazon-cognito-identity-js";

const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const hasCognito = Boolean(poolId && clientId && !poolId.includes("xxxxx"));

function userPool() {
  return new CognitoUserPool({ UserPoolId: poolId, ClientId: clientId });
}

export function getSession() {
  const local = localStorage.getItem("envmon_local_user");
  const token = localStorage.getItem("envmon_id_token");
  if (local || token) return { username: local || "cognito-user", token };
  return null;
}

export function logout() {
  localStorage.removeItem("envmon_local_user");
  localStorage.removeItem("envmon_id_token");
  if (hasCognito) {
    const user = userPool().getCurrentUser();
    if (user) user.signOut();
  }
}

export async function login(username, password) {
  if (!hasCognito) {
    if (!username || !password) throw new Error("Username and password are required");
    localStorage.setItem("envmon_local_user", username);
    return { username };
  }

  const auth = new AuthenticationDetails({ Username: username, Password: password });
  const user = new CognitoUser({ Username: username, Pool: userPool() });

  return new Promise((resolve, reject) => {
    user.authenticateUser(auth, {
      onSuccess: (session) => {
        const idToken = session.getIdToken().getJwtToken();
        localStorage.setItem("envmon_id_token", idToken);
        resolve({ username, token: idToken });
      },
      onFailure: reject,
      newPasswordRequired: () => reject(new Error("Cognito requires a new password challenge"))
    });
  });
}
