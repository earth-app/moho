git config --local user.email "action@github.com"
git config --local user.name "GitHub Action"
git fetch origin gh-pages

git switch -f gh-pages

cp LICENSE docs/LICENSE.html

for dir in ./*
do
  if [ "$dir" == "./docs" ]; then
    continue
  fi

  rm -rf "$dir"
done

cp -Rfv ./docs/* ./
rm -rf ./docs

git add .
git commit -m "Update JSDoc ($1)"
git push -f origin gh-pages
