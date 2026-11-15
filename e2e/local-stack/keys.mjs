import crypto from 'crypto';
const secret = process.env.E2E_JWT_SECRET ?? 'local-e2e-jwt-secret-at-least-32-characters-long-0001';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (p) => { const h=b64({alg:'HS256',typ:'JWT'}), b=b64(p); return `${h}.${b}.${crypto.createHmac('sha256',secret).update(`${h}.${b}`).digest('base64url')}`; };
// 고정 만료(2033-05-18) → 실행마다 같은 키가 나와 빌드에 인라인된 anon 키와 어긋나지 않는다
const exp = 2000000000;
console.log(`JWT_SECRET=${secret}`);
console.log(`ANON_KEY=${sign({iss:'supabase-local',role:'anon',exp})}`);
console.log(`SERVICE_ROLE_KEY=${sign({iss:'supabase-local',role:'service_role',exp})}`);
