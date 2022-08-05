class SpeedDial {
	constructor() {
    this.DB = openDatabase('SDX', '1', 'SDX', 1024 * 1024)

    this.DB.transaction((t) => {
      t.executeSql('CREATE TABLE IF NOT EXISTS bookmarks (id INTEGER PRIMARY KEY ASC, url TEXT, title TEXT, favicon TEXT, thumbnail TEXT, position INTEGER)')
    })

    this.getAll()
    this.initModals()
    this.initContextMenu()
    this.initSearch()
    this.initSettings()
	}

  getAll() {
    const items = document.querySelector('.speed-dial__tabs')
    const newTab = document.createElement('a')
    const modal = document.querySelector('.speed-dial__modal-add')

    items.innerHTML = ''

		this.DB.transaction((t) => {
			t.executeSql('SELECT * FROM bookmarks ORDER BY position', [], (transaction, results) => {
				for(let i = 0; i < results.rows.length; i++) {
					let row = results.rows.item(i)
          let item = document.createElement('a')

          item.classList.add('speed-dial__tabs-item')
          item.setAttribute('href', row.url)
          item.setAttribute('data-id', row.id)
          item.setAttribute('draggable', 'true')
          item.setAttribute('style', `background-image:url(${row.thumbnail})`)
          item.innerHTML = `<div class="speed-dial__tabs-item-title"><div class="speed-dial__tabs-item-title-icon" style="background-image:url(${row.favicon})"></div><div class="speed-dial__tabs-item-title-text">${row.title}</div></div>`

          items.appendChild(item)
				}

        if(localStorage.addButton) {
          newTab.classList.add('speed-dial__tabs-item-new')
          newTab.setAttribute('href', '#')
          items.appendChild(newTab)

          newTab.addEventListener('click', () => {
            this.show(modal)
          })
        }

        this.initSorting()
			})
		})
  }

  async get(id) {
	  if(id) {
      return new Promise((resolve) => {
        this.DB.transaction((t) => {
          t.executeSql('SELECT * FROM bookmarks WHERE id=?', [id], (transaction, results) => {
            resolve(results.rows.item(0))
          })
        })
      })
    }
  }

  async getPosition() {
	  return new Promise((resolve) => {
      this.DB.transaction((t) => {
        t.executeSql('SELECT * FROM bookmarks ORDER BY position', [], (transaction, results) => {
          let position = 0

          for(let i = 0; i < results.rows.length; i++) {
            let row = results.rows.item(i)
            position = (row.position > position) ? row.position : position
          }

          resolve(position + 1)
        })
      })
    })
	}

	setPosition(id, position) {
	  this.DB.transaction((t) => {
      t.executeSql('UPDATE bookmarks SET position=? WHERE id=?', [position, id])
    })
  }

  async add(url) {
    const res = await this.createThumbnail(url)
    const favicon = res.favicon || `https://favicon.yandex.net/favicon/v2/${url}?size=32&stub=1`
    const position = await this.getPosition()

		this.DB.transaction((t) => {
			t.executeSql('INSERT INTO bookmarks (url, title, favicon, thumbnail, position) VALUES (?, ?, ?, ?, ?)', [url, res.title, favicon, res.thumbnail, position], (tx, results) => {
        this.getAll()
			})
		})
  }

  edit(id, url, title) {
    this.DB.transaction((t) => {
			t.executeSql('UPDATE bookmarks SET url=?, title=? WHERE id=?', [url, title, id], (tx, results) => {
        this.getAll()
      })
		})
  }

  delete(id) {
    if(confirm('Вы действительно хотите удалить закладку?')) {
      this.DB.transaction((t) => {
        t.executeSql('DELETE FROM bookmarks WHERE id=?', [id], (tx, results) => {
          this.getAll()
        })
      })
    }
  }

  clear() {
    if(confirm('Вы действительно хотите удалить все данные?')) {
      this.DB.transaction((t) => {
        t.executeSql('DELETE FROM bookmarks', [], (tx, results) => {
          this.getAll()
        })
      })

      localStorage.clear()
    }
  }

  async createThumbnail(url) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({act: 'thumbnail', url: url}, function(response) {
        resolve(response)
      })
    })
  }

  setThumbnail(id, thumbnail) {
    this.DB.transaction((t) => {
      t.executeSql('UPDATE bookmarks SET thumbnail=? WHERE id=?', [thumbnail, id], (tx, results) => {
        this.getAll()
      })
    })
  }

  show(el) {
    el.classList.add('show')
  }

  hide(el) {
    el.classList.add('hide')

    setTimeout(() => {
      el.classList.remove('show', 'hide')
    }, 125)
  }

  initModals() {
    const modal = document.querySelectorAll('.speed-dial__modal')
    const close = document.querySelectorAll('.speed-dial__modal-close')
    const formAdd = document.querySelector('.speed-dial__modal-add form')
    const formEdit = document.querySelector('.speed-dial__modal-edit form')
    const that = this

    formAdd.addEventListener('submit', (e) => {
      const url = formAdd.querySelector('[name="url"]').value

      that.add(url)

      modal.forEach((el) => {
        this.hide(el)
      })

      e.preventDefault()
    })

    formEdit.addEventListener('submit', (e) => {
      const id = formEdit.querySelector('[name="id"]').value
      const url = formEdit.querySelector('[name="url"]').value
      const title = formEdit.querySelector('[name="title"]').value

      that.edit(id, url, title)

      modal.forEach((el) => {
        this.hide(el)
      })

      e.preventDefault()
    })

    close.forEach((el2) => {
      el2.addEventListener('click', () => {
        modal.forEach((el) => {
          this.hide(el)
        })
      })
    })

    document.addEventListener('click', (e) => {
      modal.forEach((el) => {
        if(e.target === el) {
          this.hide(el)
        }
      })
    })
  }

  initContextMenu() {
    let tab = null
    let id = null

    document.addEventListener('contextmenu', async(e) => {
      const tabItem = e.target.closest('.speed-dial__tabs-item')
      const search = e.target.closest('.speed-dial__search-input')
      const pushed = document.querySelector('.speed-dial--pushed')
      let context = document.querySelector('.speed-dial__context-menu-page')

      if(search) {
        return false
      }

      e.preventDefault()

      if(pushed) {
        return false
      }

      if(tabItem) {
        context = document.querySelector('.speed-dial__context-menu-tab')
        id = tabItem.getAttribute('data-id')
      }

      context.style.top = (e.clientY + context.clientHeight >= screen.height) ? `${e.clientY - context.clientHeight}px` : `${e.clientY}px`
      context.style.left = (e.clientX + context.clientWidth >= screen.width) ? `${e.clientX - context.clientWidth}px` : `${e.clientX}px`
      this.show(context)

      tab = await this.get(id)
    })

    document.addEventListener('click', async(e) => {
      const value = e.target.getAttribute('data-value')

      document.querySelectorAll('.speed-dial__context-menu').forEach((el) => {
        this.hide(el)
      })

      switch(value) {
        case 'add':
          this.show(document.querySelector('.speed-dial__modal-add'))
          break

        case 'settings':
          this.showSettings()
          break

        case 'newtab':
          e.target.setAttribute('href', tab.url)
          break

        case 'edit':
          const formEdit = document.querySelector('.speed-dial__modal-edit form')
          formEdit.querySelector('[name="id"]').value = tab.id
          formEdit.querySelector('[name="url"]').value = tab.url
          formEdit.querySelector('[name="title"]').value = tab.title
          this.show(document.querySelector('.speed-dial__modal-edit'))
          break

        case 'reload':
          const res = await this.createThumbnail(tab.url)
          this.setThumbnail(tab.id, res.thumbnail)
          break

        case 'delete':
          this.delete(tab.id)
          break
      }
    })
  }

  initSorting() {
    const dropZones = document.querySelectorAll('.speed-dial__tabs')
    const dragItems = document.querySelectorAll('.speed-dial__tabs-item')
    const newTab = document.querySelector('.speed-dial__tabs-item-new')
    let draggedItem = null
    let droppedItem = null

    dragItems.forEach((dragItem) => {
      dragItem.addEventListener('dragstart', () => {
        draggedItem = dragItem

        if(newTab) {
          newTab.style.display = 'none'
        }
      })

      dragItem.addEventListener('dragend', () => {
        draggedItem = null

        if(newTab) {
          newTab.style.display = 'block'
        }
      })

      dragItem.addEventListener('dragenter', (e) => {
        if(draggedItem !== droppedItem) {
          droppedItem = dragItem
        }

        e.preventDefault()
      })

      dragItem.addEventListener('dragleave', () => {
        droppedItem = null
      })
    })

    dropZones.forEach((dropZone) => {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault()
      })

      dropZone.addEventListener('drop', () => {
        if(droppedItem) {
          if(droppedItem.parentElement === draggedItem.parentElement) {
            const children = Array.from(droppedItem.parentElement.children)
            const draggedIndex = children.indexOf(draggedItem)
            const droppedIndex = children.indexOf(droppedItem)

            if(draggedIndex > droppedIndex) {
              draggedItem.parentElement.insertBefore(draggedItem, droppedItem)
            } else {
              draggedItem.parentElement.insertBefore(draggedItem, droppedItem.nextElementSibling)
            }
          } else {
            dropZone.insertBefore(draggedItem, droppedItem)
          }

          document.querySelectorAll('.speed-dial__tabs-item').forEach((tab, index) => {
            const id = tab.getAttribute('data-id')
            const position = index + 1

            this.setPosition(id, position)
          })
        }
      })
    })
  }

  initSearch() {
	  const form = document.querySelector('.speed-dial__search')
    const input = document.querySelector('.speed-dial__search-input')
    const button = document.querySelector('.speed-dial__search-button')
    const suggestions = document.querySelector('.speed-dial__search-suggestions')
    let suggestionsItems = ''
    let suggestionsActive = ''

    form.addEventListener('submit', (e) => {
      if(input.value === '') {
        e.preventDefault()
      }
    })

    input.addEventListener('input', async () => {
      const res = await fetch(`https://suggest.yandex.ru/suggest-sl?part=${input.value}`)
      const data = await res.json()

      button.disabled = (input.value === '')

      if(data[1].length) {
        suggestions.innerHTML = ''

        data[1].forEach((el) => {
          const item = document.createElement('div')

          item.classList.add('speed-dial__search-suggestions-item')
          item.innerHTML = el
          suggestions.appendChild(item)

          item.addEventListener('click', (e) => {
            input.value = e.target.innerHTML
            form.submit()
            this.hide(suggestions)
          })

          item.addEventListener('mouseenter', (e) => {
            suggestionsItems.forEach((el) => {
              el.classList.remove('speed-dial__search-suggestions-item--active')
            })

            e.target.classList.add('speed-dial__search-suggestions-item--active')
            suggestionsActive = e.target
          })

          item.addEventListener('mouseleave', () => {
            suggestionsItems.forEach((el) => {
              el.classList.remove('speed-dial__search-suggestions-item--active')
            })

            suggestionsActive = ''
          })
        })

        suggestionsItems = document.querySelectorAll('.speed-dial__search-suggestions-item')
        this.show(suggestions)
      }
    })

    input.addEventListener('focus', () => {
      if(input.value !== '') {
        this.show(suggestions)
      }
    })

    input.addEventListener('blur', () => {
      this.hide(suggestions)
    })

    document.addEventListener('keyup', (e) => {
      if(getComputedStyle(suggestions).display === 'block') {
        if(e.key === 'ArrowUp') {
          if(!suggestionsActive) {
            suggestionsActive = suggestions.lastChild
          } else {
            suggestionsActive.classList.remove('speed-dial__search-suggestions-item--active')
            suggestionsActive = (suggestionsActive.previousElementSibling) ? suggestionsActive.previousElementSibling : suggestions.lastChild
          }

          suggestionsActive.classList.add('speed-dial__search-suggestions-item--active')
          input.value = suggestionsActive.innerHTML
        }

        if(e.key === 'ArrowDown') {
          if(!suggestionsActive) {
            suggestionsActive = suggestions.firstChild
          } else {
            suggestionsActive.classList.remove('speed-dial__search-suggestions-item--active')
            suggestionsActive = (suggestionsActive.nextElementSibling) ? suggestionsActive.nextElementSibling : suggestions.firstChild
          }

          suggestionsActive.classList.add('speed-dial__search-suggestions-item--active')
          input.value = suggestionsActive.innerHTML
        }
      }
    })
  }

  initSettings() {
    const form = document.querySelector('.speed-dial__settings-form')
    const background = form.querySelector('[name="background"]')
    const reset = form.querySelector('.speed-dial__button--reset')

    document.addEventListener('click', (e) => {
      if(!e.target.closest('.speed-dial__settings') && !e.target.closest('.speed-dial__context-menu-page')) {
        this.hideSettings()
      }
    })

    background.addEventListener('change', (e) => {
      let input = e.target.files[0]

      if(input) {
        let reader = new FileReader()

        reader.onload = (e) => {
          localStorage.background = e.target.result
          console.log(localStorage.background)
        }

        reader.readAsDataURL(input)
      }
    })

    form.addEventListener('submit', (e) => {
      e.preventDefault()

      this.setSettings(e.target)
    })

    reset.addEventListener('click', () => {
      this.clear()
      this.getSettings()
    })

    this.getSettings()
  }

  showSettings() {
    document.querySelector('.speed-dial').classList.add('speed-dial--pushed')
    document.querySelector('.speed-dial__settings').classList.add('speed-dial__settings--open')
  }

  hideSettings() {
    document.querySelector('.speed-dial').classList.remove('speed-dial--pushed')
    document.querySelector('.speed-dial__settings').classList.remove('speed-dial__settings--open')
  }

  getSettings() {
	  const form = document.querySelector('.speed-dial__settings-form')

    form.querySelector('[name="width"]').value = localStorage.width || 100
    form.querySelector('[name="countColumns"]').value = localStorage.countColumns || 6
    form.querySelector('[name="space"]').value = localStorage.space || 24
    form.querySelector('[name="verticalCenter"]').checked = localStorage.verticalCenter
    form.querySelector('[name="addButton"]').checked = localStorage.addButton
    form.querySelector('[name="email"]').value = localStorage.email || ''

    document.querySelector('body').style.cssText = `
      background: ${(localStorage.background) ? `url(${localStorage.background}) center no-repeat` : '#808590'};
      background-size: cover;
    `
    document.querySelector('.speed-dial').style.cssText = `
      justify-content: ${(localStorage.verticalCenter) ? 'center' : 'flex-start'};
    `

    document.querySelector('.speed-dial__tabs').style.cssText = `
      width: ${localStorage.width}%;
      grid-template-columns: repeat(${localStorage.countColumns}, 1fr);
      grid-gap: ${localStorage.space}px;
    `

    if(localStorage.email && localStorage.email !== '') {
	    const top = document.querySelector('.speed-dial__top')
	    const messages = document.createElement('a')

      messages.classList.add('speed-dial__messages')
      messages.setAttribute('href', 'https://e.mail.ru/messages/inbox/')
      messages.innerHTML = `<div class="speed-dial__messages-badge"></div><svg class="speed-dial__messages-ico" width="32" height="23" viewBox="0 0 32 23" xmlns="http://www.w3.org/2000/svg"><path d="M27.196 0H4.804C3.52789 0.00845052 2.30684 0.520956 1.40698 1.42582C0.507113 2.33068 0.00138056 3.55455 0 4.83069V17.6147C0.00845052 18.8908 0.520956 20.1118 1.42582 21.0117C2.33068 21.9116 3.55455 22.4173 4.83069 22.4187H27.196C28.4675 22.4103 29.6846 21.9015 30.5837 21.0023C31.4828 20.1032 31.9916 18.8862 32 17.6147V4.83069C31.9986 3.55455 31.4929 2.33068 30.593 1.42582C29.6932 0.520956 28.4721 0.00845052 27.196 0V0ZM29.598 20.4597L19.1306 11.5083C18.2582 12.2611 17.1443 12.6753 15.992 12.6753C14.8397 12.6753 13.7258 12.2611 12.8534 11.5083L2.57281 20.5825C2.28227 20.3816 2.02475 20.1366 1.80951 19.8565L12.0314 10.825L2.00701 2.32193C2.24535 2.04726 2.52655 1.81293 2.8397 1.62802L13.574 10.7289C14.2469 11.2937 15.0974 11.6033 15.976 11.6033C16.8545 11.6033 17.705 11.2937 18.378 10.7289L29.1123 1.65471C29.4254 1.83962 29.7066 2.07395 29.945 2.34862L19.9526 10.809L30.3079 19.659C30.1122 19.9596 29.873 20.2294 29.598 20.4597V20.4597Z" /></svg>`
      top.appendChild(messages)

      this.getUnreadMessages(localStorage.email)
    } else {
      const top = document.querySelector('.speed-dial__top')
      const messages = document.querySelector('.speed-dial__messages')

      if(messages) {
        top.removeChild(messages)
      }
    }
  }

  setSettings(data) {
    const formData = new FormData(data)
    const formDataObj = Object.fromEntries(formData.entries())
    const background = localStorage.background || ''

    localStorage.clear()

    for(let item in formDataObj) {
      if(item === 'background') {
        localStorage.background = background
      } else {
        localStorage[item] = formDataObj[item]
      }
    }

    this.getSettings()
    this.getAll()
  }

  async getUnreadMessages(email) {
    const res = await fetch(`https://portal.mail.ru/NaviData?mac=1&Login=${email}`)
    const json = await res.json()
    const badge = document.querySelector('.speed-dial__messages-badge')

    if(json.data.mail_cnt > 0) {
	    badge.innerHTML = json.data.mail_cnt
      badge.classList.add('show')
    } else {
      badge.classList.remove('show')
    }
  }
}

const SD = new SpeedDial()
