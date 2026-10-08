import { Header } from './components/Header'
import { BriefScreen } from './screens/BriefScreen'
import { UnderstandScreen } from './screens/UnderstandScreen'
import { UploadScreen } from './screens/UploadScreen'
import { Workspace } from './screens/Workspace'
import { useStore } from './state/store'

export default function App() {
  const { state } = useStore()
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        {state.stage === 'upload' && <UploadScreen />}
        {state.stage === 'understand' && <UnderstandScreen />}
        {state.stage === 'brief' && <BriefScreen />}
        {state.stage === 'edit' && <Workspace />}
      </main>
    </div>
  )
}
