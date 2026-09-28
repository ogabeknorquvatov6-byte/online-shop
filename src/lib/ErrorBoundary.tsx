import { Component, type ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * Ilovada hech qanday error boundary yo'q edi — bitta uncaught xato
 * (masalan localStorage yozishda) butun React daraxtini butunlay
 * o'chirib, foydalanuvchini doimiy oq ekranda "qotirib" qo'yardi,
 * chunki keyingi navigatsiyalar allaqachon o'lgan React root'ga
 * ta'sir qilolmaydi.
 *
 * Bu boundary xatoni ushlaydi va foydalanuvchiga bosh sahifaga
 * qaytish imkonini beradi, ilovani butunlay qayta yuklamasdan.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('OpenShop: uncaught error', error, info);
  }

  /*
   * ATAYLAB to'liq qayta yuklash.
   *
   * Ilgari bu yerda `setState({ hasError: false })` bajarilardi: React
   * o'sha buzuq daraxtni QAYTA render qilar, xato darhol takrorlanar va
   * foydalanuvchi cheksiz aylanaga tushib qolardi. Bundan tashqari xato
   * sababi ko'pincha yaroqsiz holat (buzilgan savat, eskirgan sessiya)
   * bo'ladi — uni faqat toza yuklash tozalaydi.
   */
  handleReset = () => {
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center">
          <div className="rounded-full bg-orange-50 p-4 text-orange-600">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Nimadir noto'g'ri ketdi</h1>
            <p className="mt-1 text-sm text-gray-500">Sahifani qayta yuklab ko'ring yoki bosh sahifaga qayting.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1.5 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700"
            >
              <RefreshCw className="h-4 w-4" /> Bosh sahifaga qaytish
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
