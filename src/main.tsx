import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App.tsx';
import { ErrorBoundary } from './lib/ErrorBoundary.tsx';
import { SplashScreen } from './lib/SplashScreen.tsx';
import { migrateLegacyHashUrl } from './lib/router.tsx';
import './index.css';

/*
 * Ilova hash-marshrutdan (`#/catalog`) toza manzilga (`/catalog`) koʻchdi.
 * Eski havolalar — Telegram bot xabarlari, foydalanuvchi xatchoʻplari,
 * tashqi saytlardagi havolalar — buzilmasligi kerak, shuning uchun ular
 * REACT RENDER BOʻLISHIDAN OLDIN almashtiriladi. Aks holda foydalanuvchi
 * avval bosh sahifani koʻrib, keyin kerakli sahifaga sakrardi.
 */
migrateLegacyHashUrl();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {/*
        `reducedMotion="user"` makes every Motion animation in the app respect
        the OS "reduce motion" setting by collapsing transform/layout animation
        to opacity only. Previously each component had to remember to call
        useReducedMotion() itself, and most (page transitions, scroll reveals,
        staggered grids) did not.
      */}
      <MotionConfig reducedMotion="user">
        {/*
          Kirish ekrani `<App />` dan OLDIN yoziladi, lekin uning
          O'RNIGA emas — u qoplama (`fixed inset-0`). Ikkalasi bir
          vaqtda mount bo'ladi, ya'ni ilova splash ko'rinib turgan
          paytdayoq ma'lumot yuklay boshlaydi va uning davomiyligi
          hech kimning kutish vaqtiga qo'shilmaydi.
        */}
        <SplashScreen />
        <App />
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>
);
