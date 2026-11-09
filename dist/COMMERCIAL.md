# Zovo Doc Viewer licences

Zovo Doc Viewer is free under the GNU GPL, version 3 or later. You can also buy a commercial licence. You choose one of the two.

## Which licence do I need?

| Your project | Licence | Price |
|---|---|---|
| Open source under GPLv3 or a compatible licence | GPL-3.0-or-later (the LICENSE file) | free |
| Personal site, school project, internal test, or a page on localhost | GPL-3.0-or-later | free |
| Closed-source website, app, SaaS, intranet or product, 1 project | Commercial, 1 project | USD 79 once |
| Closed-source, as many projects as your company makes | Commercial, unlimited projects | USD 199 once |

The GPL lets you use, change and share the code. If you ship it inside your own software, the GPL asks you to share that software's source under the GPL too. If you cannot or do not want to do that, buy the commercial licence. It gives you the same code under terms that let you keep your own code closed.

## What you get with the commercial licence

- The right to use Zovo Doc Viewer in closed-source projects: 1 project, or unlimited projects with the USD 199 licence.
- A licence key for the `license-key` attribute. With a valid key, the small "Zovo Doc Viewer" link in the corner of the viewer no longer shows. The key is checked inside the browser. It never calls a server.
- All 0.x and 1.x releases. There is no subscription and nothing to renew.
- Support through GitHub issues.

The viewer works the same with and without a key. The only visible change is the corner link.

## How to buy

1. Choose a tier on GitHub Sponsors:
   - [USD 79 once, 1 project](https://github.com/sponsors/theluckystrike/sponsorships?tier_id=680015)
   - [USD 199 once, unlimited projects](https://github.com/sponsors/theluckystrike/sponsorships?tier_id=680016)
2. Your key arrives within 1 working day by GitHub message or email.
3. Add it to the element:

```html
<zovo-doc-viewer src="/files/report.docx" license-key="ZOVO1...."></zovo-doc-viewer>
```

GitHub sends a receipt for each payment. If your company needs to pay a different way, open an issue and say so.

## Questions people ask

### What counts as one project?

One website, web app or product, under one name. Its staging, test and development copies are part of the same project. A second product with its own name is a second project.

### Is the corner link required under the GPL?

No. Under the GPL you may change the code, and that includes removing the link. The commercial licence is about closed-source use. The key that hides the link is a convenience that comes with it.

### Can I use it on an intranet?

Yes. Files are read in the browser, so private and intranet files work. An internal company tool that is not open source needs the commercial licence.

### Do I need a licence for each developer?

No. The licence is for projects, not for people.

### Can I test it before I buy?

Yes. Everything works on localhost and on public pages without a key, so you can try it with your own files first. If a file does not look right, open an issue with a sample before you pay.

### I already bought Zovo Pro for USD 19. Does that key work here?

No. Zovo Pro unlocks the VS Code viewers. This licence covers use of the web component in your own products, so it has its own key.
