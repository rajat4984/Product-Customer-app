import { json, useLoaderData, useNavigate, useSearchParams, useSubmit } from "@remix-run/react";
import {
  BlockStack,
  Box,
  Button,
  DataTable,
  InlineStack,
  LegacyCard,
  Page,
  Pagination,
  Text,
  TextField,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { TitleBar, useAppBridge, Modal } from "@shopify/app-bridge-react";
import { useState } from "react";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || null;
  const direction = url.searchParams.get("direction") || "after";


  let queryParams = "(first: 10)";
  if(direction === 'after' && cursor ){
    queryParams = `(first: 10, after: "${cursor}")`;
  }
  else if(direction === 'before' && cursor ){
    queryParams = `(last: 10, before: "${cursor}")`;
  }

  const response = await admin.graphql(
    `#graphql
    query GetProducts {
      products${queryParams} {
        nodes {
          id
          variants(first: 10) {
            nodes {
              id
            }
          }
          title
          priceRangeV2 {
            maxVariantPrice {
              amount
            }
            minVariantPrice {
              amount  
            }
          }
          media(first: 5) {
            edges {
              node {
                ... on MediaImage {
                  image {
                    url
                  }
                }
              }
            }
          }
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          startCursor
          endCursor
        }
      }
    }`
  );

  const result = await response.json();
  return json({
    products: result.data.products,
  });
}

export async function action({ request }) {
  const body = await request.formData();
  const data = JSON.parse(body.get("data"));
  const { id, variant_id, price } = data;
  const { admin } = await authenticate.admin(request);

  const updateResponse = await admin.graphql(
    `
      mutation UpdateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        productId: id,
        variants: [
          {
            id: variant_id,
            price: price,
          },
        ],
      },
    },
  );

  console.log("Update response:", updateResponse);

  return json({ success: true, updatedProduct: updateResponse });
}

export default function ProductList() {
 const { products } = useLoaderData();
  const shopify = useAppBridge();
  const [editProduct, setEditProduct] = useState(null);
  const [editPrice, setEditPrice] = useState("");
  const submit = useSubmit();
  const navigate = useNavigate();


  console.log("Products loaded:", products);

  const handleOpenModal = (product) => {
    setEditProduct(product);
    shopify.modal.show("my-modal");
  };

  const handleUpdatePrice = (product, price) => {
    const variant_id = product.variants.nodes[0].id;
    const formData = submit(
      {
        data: JSON.stringify({ price, id: product.id, variant_id: variant_id }),
      },
      { method: "POST" },
    );
    shopify.modal.hide("my-modal");
  };

  const rows = products.nodes.map((product) => {
    const imageUrl = product.media.edges[0]?.node.image.url || "";
    return [
      product.title,
      "₹" + product.priceRangeV2.minVariantPrice.amount,
      <img
        src={imageUrl}
        alt={product.title}
        style={{ width: "50px", borderRadius: "5px" }}
      />,
      <Button onClick={() => handleOpenModal(product)}>Edit</Button>,
    ];
  });

  const handleNext = () => {
    if (products.pageInfo.hasNextPage) {
      navigate(`?cursor=${products.pageInfo.endCursor}&direction=after`);
    }
  };

  const handlePrevious = () => {
    if (products.pageInfo.hasPreviousPage) {
      navigate(`?cursor=${products.pageInfo.startCursor}&direction=before`);
    }
  };
  return (
    <Page title="Product list">
      <LegacyCard>
        <DataTable
          columnContentTypes={["text", "text", "text", "text"]}
          headings={["Title", "Price", "Image", "Action"]}
          rows={rows}
        />
        <BlockStack align="center" inlineAlign="center"  padding={500}>
          <Pagination
            hasNext={products.pageInfo.hasNextPage}
            hasPrevious={products.pageInfo.hasPreviousPage}
            onNext={() => handleNext()}
            onPrevious={() => handlePrevious()}
          />
        </BlockStack>
      </LegacyCard>
      <Modal id="my-modal">
        <input type="hidden" name="productId" value={editProduct?.id} />
        <Box padding={400}>
          <BlockStack gap={400} align="center">
            <img
              src={editProduct?.media.edges[0]?.node.image.url || ""}
              alt={editProduct?.title}
              style={{ width: "100px", borderRadius: "5px" }}
            />
            <Text>{editProduct?.title}</Text>
            <Text>
              Price: ₹{editProduct?.priceRangeV2.minVariantPrice.amount}
            </Text>
            <TextField
              type="number"
              label="Update Price"
              name="newPrice"
              value={
                editPrice ||
                editProduct?.priceRangeV2.minVariantPrice.amount ||
                ""
              }
              onChange={(value) => {
                setEditPrice(value);
              }}
            ></TextField>
          </BlockStack>
        </Box>

        <TitleBar title="Edit product">
          <button
            onClick={() => handleUpdatePrice(editProduct, editPrice)}
            variant="primary"
          >
            Update price
          </button>
          <button onClick={() => shopify.modal.hide("my-modal")}>Cancel</button>
        </TitleBar>
      </Modal>
    </Page>
  );
}
