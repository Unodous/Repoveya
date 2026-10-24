import { useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { downloadFile } from './domain'
import type { Workspace } from './domain'
import { exportBackup, MAX_BACKUP_BYTES, mergeWorkspace, parseBackup } from './workspace'
import Icon from './Icon'
import Modal from './Modal'

export default function LibraryTools({
  workspace,
  setWorkspace,
  onClose,
}: {
  workspace: Workspace
  setWorkspace: Dispatch<SetStateAction<Workspace>>
  onClose: () => void
}) {
  const [incoming, setIncoming] = useState<Workspace | null>(null)
  const [filename, setFilename] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [reading, setReading] = useState(false)
  const sequence = useRef(0)
  const duplicates =
    incoming?.saved.filter((s) => workspace.saved.some((c) => c.repo.id === s.repo.id)).length || 0
  return (
    <Modal title="Ваши данные" onClose={onClose}>
      <p className="modal-description">
        Библиотека хранится в этом браузере. Скачайте копию, чтобы перенести её на телефон, другой
        компьютер или восстановить позже.
      </p>
      <section className="backup-section">
        <span className="tool-symbol">
          <Icon name="download" size={24} />
        </span>
        <div>
          <h3>Сохранить всё</h3>
          <p>
            Репозитории: {workspace.saved.length} · Коллекции: {workspace.collections.length}.
            Вместе с заметками и решениями.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            downloadFile(
              `repoveya-backup-${new Date().toISOString().slice(0, 10)}.json`,
              exportBackup(workspace),
              'application/json',
            )
            setStatus('Копия подготовлена. Проверьте папку загрузок.')
          }}
        >
          Скачать резервную копию <Icon name="download" size={16} />
        </button>
      </section>
      <section className="backup-section">
        <span className="tool-symbol">
          <Icon name="upload" size={24} />
        </span>
        <div>
          <h3>Восстановить из файла</h3>
          <p>
            Новые проекты добавятся к вашей библиотеке. Уже сохранённые проекты и их заметки
            останутся без изменений.
          </p>
        </div>
        <label className="file-picker">
          Выбрать копию .json
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Файл резервной копии"
            disabled={reading}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const current = ++sequence.current
              setError('')
              setStatus('')
              setIncoming(null)
              setReading(true)
              try {
                if (file.size > MAX_BACKUP_BYTES)
                  throw new Error('Файл слишком большой. Максимальный размер — 5 МБ.')
                const parsed = parseBackup(await file.text())
                if (sequence.current === current) {
                  setIncoming(parsed)
                  setFilename(file.name)
                }
              } catch (e) {
                if (sequence.current === current)
                  setError(e instanceof Error ? e.message : 'Не удалось прочитать файл.')
              } finally {
                if (sequence.current === current) setReading(false)
              }
            }}
          />
        </label>
        {reading && <p role="status">Проверяем файл…</p>}
        {incoming && (
          <div className="import-preview">
            <strong>{filename}</strong>
            <p>
              Добавится проектов: {incoming.saved.length - duplicates}. Уже есть в библиотеке:{' '}
              {duplicates}.
            </p>
            <p>
              Коллекций в копии: {incoming.collections.length}. Совпадающие названия будут
              объединены.
            </p>
            <button
              className="primary"
              onClick={() => {
                setWorkspace((current) => mergeWorkspace(current, incoming))
                setIncoming(null)
                setStatus('Копия импортирована. Текущие заметки сохранены.')
              }}
            >
              Добавить в библиотеку <Icon name="check" size={16} />
            </button>
            <button className="text-button" onClick={() => setIncoming(null)}>
              Отмена
            </button>
          </div>
        )}
      </section>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      <p className="privacy-note">
        <Icon name="lock" size={15} /> Файл обрабатывается на устройстве. Автоматической
        синхронизации между устройствами пока нет.
      </p>
    </Modal>
  )
}
